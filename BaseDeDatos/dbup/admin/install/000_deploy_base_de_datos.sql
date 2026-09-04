-- Deploy base de datos DBUP
-- Ejecutar desde esta carpeta con un usuario DBA:
--
--   cd BaseDeDatos/dbup/admin/install
--   sql /nolog
--   CONNECT usando un mecanismo seguro y luego ejecutar:
--   @000_deploy_base_de_datos.sql
--
-- Este archivo solo ordena la instalacion. Los scripts individuales se mantienen
-- como piezas reutilizables.
--
-- Todos los identificadores se solicitan en tiempo de instalacion. No hay
-- usuarios, passwords, hosts ni IPs internos dentro de esta version publica.

SET ECHO ON
SET DEFINE ON
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE

ACCEPT DBUP_OWNER CHAR PROMPT 'Schema owner de DBUP (ejemplo: DBUP_ADMIN): '
ACCEPT DBUP_USER CHAR PROMPT 'Usuario tecnico de DBUP: '
ACCEPT DBUP_ROLE CHAR PROMPT 'Rol tecnico de DBUP: '
ACCEPT DBUP_PASSWORD CHAR PROMPT 'Password inicial de &&DBUP_USER: ' HIDE
ACCEPT DBUP_DEFAULT_TABLESPACE CHAR PROMPT 'Tablespace por defecto: '
ACCEPT DBUP_TEMP_TABLESPACE CHAR PROMPT 'Tablespace temporal: '

PROMPT ============================================================
PROMPT DBUP - Deploy base de datos
PROMPT ============================================================
PROMPT Owner administrativo DBUP: &&DBUP_OWNER
PROMPT Usuario tecnico DBUP: &&DBUP_USER
PROMPT Rol tecnico DBUP: &&DBUP_ROLE

PROMPT [1/6] Crear usuario tecnico y rol DBUP
@001_create_dbup_user.sql

PROMPT [2/6] Crear tablas, secuencia, indices y trigger de changelog
@002_create_dbup_control_tables.sql

PROMPT [3/6] Aplicar grants al usuario tecnico
@003_grant_dbup_target_privileges.sql

PROMPT [4/6] Cargar whitelist de clientes autorizados
@004_seed_allowed_clients.sql

PROMPT [5/6] Crear sinonimos para &&DBUP_USER
CREATE OR REPLACE SYNONYM &&DBUP_USER.DBUP_CHANGELOG
  FOR &&DBUP_OWNER..DBUP_CHANGELOG;

CREATE OR REPLACE SYNONYM &&DBUP_USER.DBUP_ALLOWED_CLIENTS
  FOR &&DBUP_OWNER..DBUP_ALLOWED_CLIENTS;

CREATE OR REPLACE SYNONYM &&DBUP_USER.DBUP_LOGIN_AUDIT
  FOR &&DBUP_OWNER..DBUP_LOGIN_AUDIT;

PROMPT [6/6] Crear triggers de seguridad
PROMPT       Nota: TRG_BLOCK_MANUAL_DDL queda al final dentro de este paso.
@005_create_dbup_security_triggers.sql

PROMPT ============================================================
PROMPT DBUP - Deploy base de datos finalizado
PROMPT ============================================================
