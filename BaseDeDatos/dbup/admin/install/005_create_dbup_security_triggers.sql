CREATE OR REPLACE TRIGGER &&DBUP_OWNER..TRG_DBUP_BLOCK_UNTRUSTED_LOGIN
AFTER LOGON ON DATABASE
DECLARE
  PRAGMA AUTONOMOUS_TRANSACTION;
  v_count       NUMBER;
  v_session_usr VARCHAR2(128) := UPPER(SYS_CONTEXT('USERENV', 'SESSION_USER'));
  v_ip          VARCHAR2(64) := SYS_CONTEXT('USERENV', 'IP_ADDRESS');
  v_os_user     VARCHAR2(128) := SYS_CONTEXT('USERENV', 'OS_USER');
  v_host        VARCHAR2(255) := SYS_CONTEXT('USERENV', 'HOST');
  v_program     VARCHAR2(128) := SYS_CONTEXT('USERENV', 'CLIENT_PROGRAM_NAME');
BEGIN
  IF v_session_usr = '&&DBUP_USER' THEN
    DBMS_SESSION.SET_IDENTIFIER(SUBSTR(v_session_usr || '-' || v_program, 1, 128));

    SELECT COUNT(*)
      INTO v_count
      FROM &&DBUP_OWNER..DBUP_ALLOWED_CLIENTS
     WHERE (IP_ADDRESS = v_ip OR IP_ADDRESS = '*')
       AND UPPER(OS_USER) = UPPER(v_os_user)
       AND (UPPER(HOST_NAME) = UPPER(v_host) OR HOST_NAME = '*')
       AND (CLIENT_PROGRAM_NAME = '*' OR UPPER(v_program) LIKE UPPER(CLIENT_PROGRAM_NAME))
       AND ENABLED = 'Y';

    IF v_count = 0 THEN
      INSERT INTO &&DBUP_OWNER..DBUP_LOGIN_AUDIT (
        SESSION_USER,
        OS_USER,
        HOST,
        IP_ADDRESS,
        MODULE,
        CLIENT_ID,
        ALLOWED,
        BLOCK_REASON
      ) VALUES (
        v_session_usr,
        v_os_user,
        v_host,
        v_ip,
        NVL(SYS_CONTEXT('USERENV', 'MODULE'), v_program),
        SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER'),
        'N',
        'IP/OS_USER/HOST/CLIENT_PROGRAM_NAME no cargados en DBUP_ALLOWED_CLIENTS'
      );
      COMMIT;

      DBMS_SESSION.SET_IDENTIFIER('&&DBUP_USER blocked by TRG_DBUP_BLOCK_UNTRUSTED_LOGIN');

      RAISE_APPLICATION_ERROR(
        -20002,
        'Conexion rechazada para &&DBUP_USER desde origen no autorizado.'
      );
    ELSE
      INSERT INTO &&DBUP_OWNER..DBUP_LOGIN_AUDIT (
        SESSION_USER,
        OS_USER,
        HOST,
        IP_ADDRESS,
        MODULE,
        CLIENT_ID,
        ALLOWED,
        BLOCK_REASON
      ) VALUES (
        v_session_usr,
        v_os_user,
        v_host,
        v_ip,
        NVL(SYS_CONTEXT('USERENV', 'MODULE'), v_program),
        SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER'),
        'Y',
        NULL
      );
      COMMIT;
    END IF;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER &&DBUP_OWNER..TRG_BLOCK_MANUAL_DDL
BEFORE DDL ON DATABASE
DECLARE
  v_owner VARCHAR2(128);
BEGIN
  IF SOPORTEDBA.PKG_DDL_GUARD.IS_ROLE_GRANTS_ALLOWED THEN
    RETURN;
  END IF;

  v_owner := ORA_DICT_OBJ_OWNER;

  IF REGEXP_LIKE(v_owner, '^(ENTIDAD|PARAM)[0-9]{3}$')
     AND SYS_CONTEXT('USERENV', 'SESSION_USER') <> '&&DBUP_USER'
     AND ORA_SYSEVENT <> 'TRUNCATE'
  THEN
    RAISE_APPLICATION_ERROR(
      -20001,
      'DDL manual bloqueado para schema protegido. Use el flujo DBUP/GitLab.'
    );
  END IF;
END;
/
