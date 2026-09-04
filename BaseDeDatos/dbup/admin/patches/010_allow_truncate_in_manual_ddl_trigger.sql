-- Permite TRUNCATE manual/batch sobre schemas protegidos.
-- TRUNCATE en Oracle dispara eventos DDL; este patch evita que
-- TRG_BLOCK_MANUAL_DDL lo bloquee.
-- Tambien permite los GRANT / CREATE SYNONYM ejecutados por
-- SOPORTEDBA.PRC_EXEC_ROLE_GRANTS mediante PKG_DDL_GUARD.
--
-- Antes de ejecutar este patch, definir DBUP_OWNER con el owner administrativo
-- DBUP correspondiente. Ejemplo:
--
--   DEFINE DBUP_OWNER = SOPORTEDBA

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
