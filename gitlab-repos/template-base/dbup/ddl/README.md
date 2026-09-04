# DBUP DDL

Cada cambio DDL vive como un archivo `.sql` versionado y promovido por GitLab.

Convencion de nombre:

```text
dbup/ddl/<shared|dev|qa|uat>/<ENTIDAD###|PARAM###>/DBUP-1234_descripcion_corta.sql
```

Ejemplos:

```text
dbup/ddl/dev/ENTIDAD700/DBUP-1234_crear_tabla_cliente.sql
dbup/ddl/qa/ENTIDAD700/DBUP-1234_crear_tabla_cliente.sql
dbup/ddl/uat/PARAM701/DBUP-2234_alter_parametro.sql
```

Headers obligatorios al inicio de cada script:

```sql
-- JIRA_TICKET: DBUP-1234
-- TARGET_SCHEMA: ENTIDAD700
```

El `TARGET_SCHEMA` tiene que coincidir con la carpeta de entidad. Por ejemplo, un script dentro de `dbup/ddl/dev/ENTIDAD700` debe declarar `-- TARGET_SCHEMA: ENTIDAD700`.

El pipeline ejecuta primero `dbup/ddl/shared/<entidad>` y luego `dbup/ddl/<ambiente>/<entidad>`, ordenado alfabeticamente por ruta.
