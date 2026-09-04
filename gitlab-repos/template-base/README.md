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

Pipeline DBUP. Valida scripts y despliega en DEV, QA y UAT.

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
dbup/ddl/qa/ENTIDAD700/DBUP-1234_descripcion.sql
dbup/ddl/uat/ENTIDAD700/DBUP-1234_descripcion.sql
```

Los scripts viejos quedan en el repo como historico. Los cambios nuevos se agregan como archivos SQL nuevos.

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

Para QA/UAT:

```text
DBUP_QA_HOST
DBUP_UAT_HOST
```

`DBUP_SQL_CMD` ya queda definido por defecto como `sql`.

El usuario `DB_USER` debe ser el usuario tecnico creado por los scripts de `BaseDeDatos`, normalmente `{DBUP_USER}`.
