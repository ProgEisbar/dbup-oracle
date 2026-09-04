-- Ejecutar con un usuario DBA.
-- Ajustar la lista segun la entidad/parametro que se habilite para DBUP.
--
-- Del DDL de SOPORTEDBA en produccion se rescatan como referencia:
-- - roles de negocio PARAM###_DML, cuando existen.
-- - grants DDL directos, porque no existe rol ENTIDAD###_DDL/PARAM###_DDL.
--
-- No se copian roles amplios como DBA, RESOURCE, GRANT ANY OBJECT PRIVILEGE,
-- Data Pump, AQ, Streams/XStream ni privilegios directos sobre SYS.

-- El acceso DBUP de control/auditoria se otorga directo al usuario tecnico
-- en 002_create_dbup_control_tables.sql. El rol &&DBUP_ROLE queda
-- opcional para instalaciones donde la politica local permita otorgarlo.

-- Roles de lectura/DML por entidad.
-- Descomentar solo si los roles existen en la base.
-- GRANT ENTIDAD700_SELECT TO &&DBUP_USER;
-- GRANT ENTIDAD700_DML    TO &&DBUP_USER;

-- Grants DML generales.
-- Necesarios si los scripts DBUP insertan/actualizan datos en objetos de schemas
-- ENTIDAD###/PARAM### que no tienen grants objeto por objeto al momento del deploy.
GRANT SELECT ANY TABLE TO &&DBUP_USER;
GRANT INSERT ANY TABLE TO &&DBUP_USER;
GRANT UPDATE ANY TABLE TO &&DBUP_USER;
GRANT DELETE ANY TABLE TO &&DBUP_USER;

-- Roles de lectura/DML por parametro.
-- Descomentar solo si los roles existen en la base.
-- GRANT PARAM700_SELECT TO &&DBUP_USER;
-- GRANT PARAM700_DML    TO &&DBUP_USER;

-- Roles encontrados en el DDL de SOPORTEDBA.
-- Descomentar si DBUP debe operar esos parametros.
-- GRANT PARAM701_DML TO &&DBUP_USER;
-- GRANT PARAM703_DML TO &&DBUP_USER;

-- Grants DDL directos.
GRANT ALTER ANY TABLE TO &&DBUP_USER;
GRANT CREATE ANY TABLE TO &&DBUP_USER;
GRANT CREATE ANY INDEX TO &&DBUP_USER;
GRANT CREATE ANY SEQUENCE TO &&DBUP_USER;
GRANT CREATE ANY TRIGGER TO &&DBUP_USER;
GRANT CREATE ANY PROCEDURE TO &&DBUP_USER;
GRANT CREATE ANY VIEW TO &&DBUP_USER;
GRANT CREATE ANY SYNONYM TO &&DBUP_USER;

-- Agregar solo si el piloto realmente modifica o elimina estos objetos.
-- GRANT ALTER ANY INDEX TO &&DBUP_USER;
-- GRANT ALTER ANY SEQUENCE TO &&DBUP_USER;
-- GRANT ALTER ANY TRIGGER TO &&DBUP_USER;
-- GRANT ALTER ANY PROCEDURE TO &&DBUP_USER;
-- GRANT DROP ANY TABLE TO &&DBUP_USER;
-- GRANT DROP ANY INDEX TO &&DBUP_USER;
-- GRANT DROP ANY SEQUENCE TO &&DBUP_USER;
-- GRANT DROP ANY TRIGGER TO &&DBUP_USER;
-- GRANT DROP ANY PROCEDURE TO &&DBUP_USER;
-- GRANT DROP ANY VIEW TO &&DBUP_USER;
-- GRANT DROP ANY SYNONYM TO &&DBUP_USER;

-- Plantilla para nuevas entidades/parametros cuando existan roles de negocio:
-- GRANT ENTIDAD###_SELECT TO &&DBUP_USER;
-- GRANT ENTIDAD###_DML    TO &&DBUP_USER;
-- GRANT PARAM###_SELECT   TO &&DBUP_USER;
-- GRANT PARAM###_DML      TO &&DBUP_USER;
