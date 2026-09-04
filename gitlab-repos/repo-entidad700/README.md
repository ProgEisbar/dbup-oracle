# Archivos para GitLab

Subir el contenido de esta carpeta como raiz del proyecto GitLab.

```text
GitLab/
├── .gitlab-ci.yml
├── ci/
├── dbup/
├── Docker/
└── docs/
```

## Donde va cada cosa

```text
.gitlab-ci.yml
```

Pipeline DBUP del repo DEV. Valida scripts, despliega en DEV y permite promover archivos al repo QA.

```text
ci/
```

Scripts que usa el pipeline:

- `validate-ddl.sh`: valida nombres, headers y entidad.
- `run-ddl.sh`: arma la conexion SQLcl, evita repetir scripts ya exitosos y registra en `DBUP_CHANGELOG`.

```text
dbup/ddl/
```

Scripts DDL nuevos por ambiente y entidad.

```text
dbup/ddl/dev/ENTIDAD700/DBUP-1234_descripcion.sql
dbup/ddl/shared/ENTIDAD700/DBUP-1234_descripcion.sql
```

Los scripts viejos quedan en el repo como historico. Los cambios nuevos se agregan como archivos SQL nuevos.

```text
templates/dev/
```

Templates para cambios que aplican a varias entidades. El job manual `distribute:dev`
los expande solo hacia las entidades declaradas en el header `TARGET_ENTITIES`.

```text
Docker/
```

Dockerfile y YAML de referencia para la imagen SQLcl + Java en ECR.

```text
docs/
```

Documentacion del flujo.

## Variables CI/CD

Variables minimas para DEV:

```text
DBUP_SQLCL_IMAGE={DBUP_SQLCL_IMAGE}
DB_USER={DBUP_USER}
DB_PASSWORD
DB_SERVICES_NAME
DB_PORT
DBUP_DEV_HOST
DEV_AWS_REGION
```

`DBUP_SQL_CMD` ya queda definido por defecto como `sql`.

El usuario `DB_USER` debe ser el usuario tecnico creado por los scripts de `BaseDeDatos`, normalmente `{DBUP_USER}`.

## Promocion a QA

En este repo DEV, `promote:qa` no ejecuta SQL contra QA. Solo copia los SQL al repo QA y hace push.

Variables necesarias para `promote:qa`:

```text
DBUP_QA_REPO_URL=https://gitlab.com/{GITLAB_GROUP_PATH}/qa-dbup/entidad700.git
DBUP_QA_REPO_TOKEN=<token con write_repository sobre el repo QA>
```

El deploy real contra la base QA se ejecuta desde el pipeline del repo QA.

## Distribucion Multi Entidad

Para evitar crear el mismo SQL a mano en cada repo DEV, subir un template:

```text
templates/dev/DBUP-1234_descripcion.sql.tpl
```

Cada template debe indicar a que entidades aplica:

```sql
-- JIRA_TICKET: DBUP-1234
-- TARGET_ENTITIES: 700,701,702
-- TARGET_SCHEMA: {{ENTIDAD}}
```

Para aplicar a todas las entidades configuradas:

```sql
-- TARGET_ENTITIES: all
```

Si falta `TARGET_ENTITIES`, el job falla antes de clonar o pushear repos. Si
una entidad deja de estar declarada, el distribuidor elimina el SQL generado
previamente en esa entidad.

Placeholders disponibles:

```text
{{ENTITY}}        -> 700
{{ENTIDAD}}       -> ENTIDAD700
{{PARAM}}         -> PARAM700
{{USER_SERVICES}} -> USER_SERVICES700
```

Variable requerida para `distribute:dev`:

```text
DBUP_DEV_REPO_TOKEN=<token con write_repository sobre los repos DEV>
```
