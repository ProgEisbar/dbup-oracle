-- Plantilla pública para actualizar una instalación existente y validar
-- &&DBUP_USER por IP, usuario de SO, host y programa cliente.
--
-- Antes de ejecutar, reemplazar todos los marcadores entre llaves, por ejemplo
-- {IP_RUNNER_1}, {USUARIO_1} y {HOST_USUARIO_1}. Nunca versionar los valores
-- reales utilizados en un ambiente.

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO v_count
    FROM USER_TAB_COLUMNS
   WHERE TABLE_NAME = 'DBUP_ALLOWED_CLIENTS'
     AND COLUMN_NAME = 'HOST_NAME';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE DBUP_ALLOWED_CLIENTS ADD HOST_NAME VARCHAR2(255)';
  END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM USER_TAB_COLUMNS
   WHERE TABLE_NAME = 'DBUP_ALLOWED_CLIENTS'
     AND COLUMN_NAME = 'CLIENT_PROGRAM_NAME';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE DBUP_ALLOWED_CLIENTS ADD CLIENT_PROGRAM_NAME VARCHAR2(128) DEFAULT ''*'' NOT NULL';
  END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM USER_CONSTRAINTS
   WHERE TABLE_NAME = 'DBUP_ALLOWED_CLIENTS'
     AND CONSTRAINT_NAME = 'UX_DBUP_ALLOWED_CLIENT';

  IF v_count > 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE DBUP_ALLOWED_CLIENTS DROP CONSTRAINT UX_DBUP_ALLOWED_CLIENT';
  END IF;

  EXECUTE IMMEDIATE
    'ALTER TABLE DBUP_ALLOWED_CLIENTS ADD CONSTRAINT UX_DBUP_ALLOWED_CLIENT UNIQUE (ENVIRONMENT, IP_ADDRESS, OS_USER, HOST_NAME, CLIENT_PROGRAM_NAME)';
END;
/

UPDATE DBUP_ALLOWED_CLIENTS
   SET ENABLED = 'N';

MERGE INTO DBUP_ALLOWED_CLIENTS dst
USING (
  SELECT 'DEV' ENVIRONMENT, '{IP_RUNNER_1}' IP_ADDRESS, 'appuser' OS_USER, '*' HOST_NAME, 'SQLcl' CLIENT_PROGRAM_NAME,
         'GitLab runner DEV DBUP - runner 1' DESCRIPTION, 'Y' ENABLED
    FROM DUAL
  UNION ALL
  SELECT 'QA', '{IP_RUNNER_1}', 'appuser', '*', 'SQLcl',
         'GitLab runner QA DBUP - runner 1', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'UAT', '{IP_RUNNER_1}', 'appuser', '*', 'SQLcl',
         'GitLab runner UAT DBUP - runner 1', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'DEV', '{IP_RUNNER_2}', 'appuser', '*', 'SQLcl',
         'GitLab runner DEV DBUP - runner 2', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'QA', '{IP_RUNNER_2}', 'appuser', '*', 'SQLcl',
         'GitLab runner QA DBUP - runner 2', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'UAT', '{IP_RUNNER_2}', 'appuser', '*', 'SQLcl',
         'GitLab runner UAT DBUP - runner 2', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'DEV', '*', '{USUARIO_1}', '{HOST_USUARIO_1}', 'Toad.exe%',
         'Conexion manual autorizada Usuario 1 DEV - Toad', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'QA', '*', '{USUARIO_1}', '{HOST_USUARIO_1}', 'Toad.exe%',
         'Conexion manual autorizada Usuario 1 QA - Toad', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'UAT', '*', '{USUARIO_1}', '{HOST_USUARIO_1}', 'Toad.exe%',
         'Conexion manual autorizada Usuario 1 UAT - Toad', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'DEV', '*', '{USUARIO_1}', '{HOST_USUARIO_1}', 'SQL Developer',
         'Conexion manual autorizada Usuario 1 DEV - SQL Developer', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'QA', '*', '{USUARIO_1}', '{HOST_USUARIO_1}', 'SQL Developer',
         'Conexion manual autorizada Usuario 1 QA - SQL Developer', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'UAT', '*', '{USUARIO_1}', '{HOST_USUARIO_1}', 'SQL Developer',
         'Conexion manual autorizada Usuario 1 UAT - SQL Developer', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'DEV', '*', '{USUARIO_2}', '{HOST_USUARIO_2}', 'Toad.exe%',
         'Conexion manual autorizada Usuario 2 DEV - Toad', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'QA', '*', '{USUARIO_2}', '{HOST_USUARIO_2}', 'Toad.exe%',
         'Conexion manual autorizada Usuario 2 QA - Toad', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'UAT', '*', '{USUARIO_2}', '{HOST_USUARIO_2}', 'Toad.exe%',
         'Conexion manual autorizada Usuario 2 UAT - Toad', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'DEV', '*', '{USUARIO_2}', '{HOST_USUARIO_2}', 'SQL Developer',
         'Conexion manual autorizada Usuario 2 DEV - SQL Developer', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'QA', '*', '{USUARIO_2}', '{HOST_USUARIO_2}', 'SQL Developer',
         'Conexion manual autorizada Usuario 2 QA - SQL Developer', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'UAT', '*', '{USUARIO_2}', '{HOST_USUARIO_2}', 'SQL Developer',
         'Conexion manual autorizada Usuario 2 UAT - SQL Developer', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'DEV', '*', '{USUARIO_3}', '{HOST_USUARIO_3}', 'Toad.exe%',
         'Conexion manual autorizada Usuario 3 DEV - Toad', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'QA', '*', '{USUARIO_3}', '{HOST_USUARIO_3}', 'Toad.exe%',
         'Conexion manual autorizada Usuario 3 QA - Toad', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'UAT', '*', '{USUARIO_3}', '{HOST_USUARIO_3}', 'Toad.exe%',
         'Conexion manual autorizada Usuario 3 UAT - Toad', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'DEV', '*', '{USUARIO_3}', '{HOST_USUARIO_3}', 'SQL Developer',
         'Conexion manual autorizada Usuario 3 DEV - SQL Developer', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'QA', '*', '{USUARIO_3}', '{HOST_USUARIO_3}', 'SQL Developer',
         'Conexion manual autorizada Usuario 3 QA - SQL Developer', 'Y'
    FROM DUAL
  UNION ALL
  SELECT 'UAT', '*', '{USUARIO_3}', '{HOST_USUARIO_3}', 'SQL Developer',
         'Conexion manual autorizada Usuario 3 UAT - SQL Developer', 'Y'
    FROM DUAL
) src
ON (
  dst.ENVIRONMENT = src.ENVIRONMENT
  AND dst.IP_ADDRESS = src.IP_ADDRESS
  AND dst.OS_USER = src.OS_USER
  AND NVL(dst.HOST_NAME, '*') = src.HOST_NAME
  AND dst.CLIENT_PROGRAM_NAME = src.CLIENT_PROGRAM_NAME
)
WHEN MATCHED THEN
  UPDATE SET
    dst.DESCRIPTION = src.DESCRIPTION,
    dst.ENABLED = src.ENABLED
WHEN NOT MATCHED THEN
  INSERT (
    ENVIRONMENT,
    IP_ADDRESS,
    OS_USER,
    HOST_NAME,
    CLIENT_PROGRAM_NAME,
    DESCRIPTION,
    ENABLED
  ) VALUES (
    src.ENVIRONMENT,
    src.IP_ADDRESS,
    src.OS_USER,
    src.HOST_NAME,
    src.CLIENT_PROGRAM_NAME,
    src.DESCRIPTION,
    src.ENABLED
  );

COMMIT;

CREATE OR REPLACE TRIGGER TRG_DBUP_BLOCK_UNTRUSTED_LOGIN
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
      FROM DBUP_ALLOWED_CLIENTS
     WHERE (IP_ADDRESS = v_ip OR IP_ADDRESS = '*')
       AND UPPER(OS_USER) = UPPER(v_os_user)
       AND (UPPER(HOST_NAME) = UPPER(v_host) OR HOST_NAME = '*')
       AND (CLIENT_PROGRAM_NAME = '*' OR UPPER(v_program) LIKE UPPER(CLIENT_PROGRAM_NAME))
       AND ENABLED = 'Y';

    IF v_count = 0 THEN
      INSERT INTO DBUP_LOGIN_AUDIT (
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
      INSERT INTO DBUP_LOGIN_AUDIT (
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
