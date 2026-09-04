-- Ejecutar con el owner ENTIDAD700 o con un usuario DBA despues de crear la tabla de prueba.
-- Permite que &&DBUP_USER valide DML sobre el objeto DBUP-0002.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ENTIDAD700.DBUP_TEST_SHARED
  TO &&DBUP_USER;
