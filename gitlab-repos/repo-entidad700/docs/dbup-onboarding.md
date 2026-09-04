# Onboarding DBUP

## Objetivo

DBUP es el flujo armado para controlar cambios DDL/DML sobre schemas Oracle de
bases Oracle usando GitLab CI/CD, SQLcl y un usuario tecnico de despliegue.

El objetivo principal es que cada cambio quede trazable por:

- ticket `DBUP`.
- archivo SQL ejecutado.
- entidad/schema destino.
- ambiente.
- commit de GitLab.
- pipeline/job.
- estado `SUCCESS` o `FAILED`.

PROD queda fuera de esta primera etapa y se tratara como un proyecto separado
por seguridad.

## Alcance Actual

La primera parte cubre ambientes bajos:

- DEV.
- QA.
- UAT.

Las entidades actualmente contempladas son:

- `ENTIDAD700` / `PARAM700`.
- `ENTIDAD701` / `PARAM701`.
- `ENTIDAD702` / `PARAM702`.
- `ENTIDAD703` / `PARAM703`.

Cada entidad tiene su propio repo por ambiente, porque no todas las entidades
manejan exactamente la misma estructura.

## Repositorios

Estructura en GitLab:

```text
dbup-ddl/
├── dev-dbup/
│   ├── entidad700
│   ├── entidad701
│   ├── entidad702
│   └── entidad703
├── qa-dbup/
│   ├── entidad700
│   ├── entidad701
│   ├── entidad702
│   └── entidad703
└── uat-dbup/
    ├── entidad700
    ├── entidad701
    ├── entidad702
    └── entidad703
```

Los repos DEV tienen mas funcionalidad que QA/UAT porque desde DEV se distribuyen
templates multi-entidad y se promueven archivos a QA.

## Componentes

### GitLab CI

Archivo principal:

```text
.gitlab-ci.yml
```

Jobs principales en DEV:

- `validate:ddl`: valida estructura y metadata. Corre automaticamente.
- `distribute:dev`: genera SQL desde templates multi-entidad. Es manual.
- `deploy:dev`: ejecuta SQL contra DEV. Es manual.
- `promote:qa`: copia SQL al repo QA. Es manual y no ejecuta contra QA.
- `build:sqlcl-image`: referencia para construir/publicar la imagen SQLcl.

Jobs principales en QA/UAT:

- `validate:ddl`: valida estructura y metadata. Corre automaticamente.
- `deploy:qa` o `deploy:uat`: ejecuta contra el ambiente correspondiente. Es manual.

### Imagen SQLcl

La imagen usada por el pipeline contiene Java y SQLcl:

```text
{DBUP_SQLCL_IMAGE}
```

La variable `DBUP_SQLCL_IMAGE` puede sobreescribir esa imagen desde GitLab.

### Scripts CI

Carpeta:

```text
ci/
```

Archivos:

- `validate-ddl.sh`: valida nombres de archivos, carpeta y headers.
- `run-ddl.sh`: conecta a Oracle, evita repetir scripts ya exitosos y registra en `DBUP_CHANGELOG`.
- `distribute-templates.sh`: solo en DEV; expande templates multi-entidad.

## Estructura de Carpetas del Repo

```text
dbup/ddl/
├── shared/
│   └── ENTIDAD700/
├── dev/
│   ├── ENTIDAD700/
│   └── PARAM700/
├── qa/
│   ├── ENTIDAD700/
│   └── PARAM700/
└── uat/
    ├── ENTIDAD700/
    └── PARAM700/
```

En cada repo se reemplaza `700` por la entidad correspondiente.

Uso esperado:

- `dbup/ddl/shared/<schema>/`: scripts promovibles entre ambientes.
- `dbup/ddl/dev/<schema>/`: scripts exclusivos de DEV.
- `dbup/ddl/qa/<schema>/`: scripts exclusivos de QA.
- `dbup/ddl/uat/<schema>/`: scripts exclusivos de UAT.

## Formato de un SQL

Nombre requerido:

```text
DBUP-1234_descripcion_sin_espacios.sql
```

Headers requeridos:

```sql
-- JIRA_TICKET: DBUP-1234
-- TARGET_SCHEMA: ENTIDAD700
```

Ejemplo:

```sql
-- JIRA_TICKET: DBUP-1234
-- TARGET_SCHEMA: ENTIDAD700

CREATE TABLE ENTIDAD700.MI_TABLA_DBUP (
  ID NUMBER NOT NULL,
  DESCRIPCION VARCHAR2(100),
  CONSTRAINT PK_MI_TABLA_DBUP PRIMARY KEY (ID)
);
```

La carpeta debe coincidir con `TARGET_SCHEMA`. Por ejemplo, si el archivo esta
en `dbup/ddl/shared/ENTIDAD700`, el header debe decir `TARGET_SCHEMA: ENTIDAD700`.

## Templates Multi Entidad

Los templates se cargan en DEV:

```text
templates/dev/DBUP-1234_descripcion.sql.tpl
```

Cada template debe declarar a que entidades aplica:

```sql
-- JIRA_TICKET: DBUP-1234
-- TARGET_ENTITIES: 700,701,702
-- TARGET_SCHEMA: {{ENTIDAD}}
```

Para aplicar a todas las entidades configuradas:

```sql
-- TARGET_ENTITIES: all
```

Placeholders disponibles:

```text
{{ENTITY}}         -> 700
{{ENTIDAD}}        -> ENTIDAD700
{{PARAM}}          -> PARAM700
{{USER_SERVICES}}  -> USER_SERVICES700
```

Ejemplo:

```sql
-- JIRA_TICKET: DBUP-9999
-- TARGET_ENTITIES: 700,702
-- TARGET_SCHEMA: {{ENTIDAD}}

CREATE OR REPLACE FUNCTION {{ENTIDAD}}.FN_DBUP_TEST (
  p_value IN VARCHAR2
) RETURN VARCHAR2
IS
BEGIN
  RETURN 'OK:{{ENTITY}}:' || p_value;
END;
/
```

Si se corre `distribute:dev`, ese template genera SQL solo en:

```text
dbup/ddl/shared/ENTIDAD700/
dbup/ddl/shared/ENTIDAD702/
```

No genera archivos en 701 ni 703.

Si una entidad deja de estar declarada en `TARGET_ENTITIES`, el distribuidor
borra el SQL generado previamente para esa entidad.

## Flujo Operativo

### Cambio comun de una sola entidad

1. Crear un archivo SQL nuevo en el repo de la entidad.
2. Ubicarlo en `dbup/ddl/shared/<schema>` si debe promoverse a QA/UAT.
3. Ubicarlo en `dbup/ddl/dev/<schema>` si es solo DEV.
4. Commit/push.
5. GitLab corre `validate:ddl`.
6. Ejecutar manualmente `deploy:dev`.
7. Si DEV salio bien, ejecutar manualmente `promote:qa`.
8. En el repo QA, ejecutar manualmente `deploy:qa`.
9. Si QA salio bien, promover a UAT segun el flujo acordado.

### Cambio comun para varias entidades

1. Crear un template en `templates/dev`.
2. Declarar `TARGET_ENTITIES`.
3. Commit/push en un repo DEV, normalmente entidad700.
4. Ejecutar manualmente `distribute:dev`.
5. Revisar los commits generados en los repos destino.
6. Ejecutar `deploy:dev` manualmente en cada repo que corresponda.

## Idempotencia y Changelog

Antes de ejecutar un SQL, `run-ddl.sh` consulta:

```sql
DBUP_CHANGELOG
```

Si ya existe un registro `S```text
dbup/ddl/
```

Scripts DDL nuevos por ambiente y entidad.

```text
dbup/ddl/qa/ENTIDAD701/DBUP-1234_descripcion.sql
dbup/ddl/shared/ENTIDAD701/DBUP-1234_descripcion.sql
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

Variables minimas para QA:

```text
DBUP_SQLCL_IMAGE={DBUP_SQLCL_IMAGE}
DB_USER={DBUP_USER}
DB_PASSWORD
DB_SERVICES_NAME
DB_PORT
DBUP_QA_HOST
DEV_AWS_REGION
```

`DBUP_SQL_CMD` ya queda definido por defecto como `sql`.

El usuario `DB_USER` debe ser el usuario tecnico creado por los scripts de `BaseDeDatos`, normalmente `{DBUP_USER}`.
