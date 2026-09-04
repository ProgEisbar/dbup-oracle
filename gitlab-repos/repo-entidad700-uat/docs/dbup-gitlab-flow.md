# Flujo DBUP con GitLab y Oracle

## Objetivo

Controlar cambios DDL sobre schemas Oracle protegidos, dejando trazabilidad por ticket, commit, ambiente, entidad y script ejecutado. En los ambientes no productivos el flujo promueve cambios por DEV, QA y UAT. PROD queda fuera de este proyecto y se tratara como proyecto separado por seguridad.

## Flujo propuesto

1. El equipo crea un archivo SQL en `dbup/ddl/shared/<entidad>` o en `dbup/ddl/<ambiente>/<entidad>`.
2. El archivo incluye `JIRA_TICKET` y `TARGET_SCHEMA`.
3. GitLab valida nombre, metadata minima y rama.
4. El deploy a DEV corre automaticamente sobre la rama default.
5. QA y UAT quedan como jobs manuales con approval desde GitLab.
6. Oracle ejecuta con el usuario tecnico `{DBUP_USER}`.
7. `DBUP_CHANGELOG` registra script, ticket, schema, ambiente, commit, fecha, usuario y estado.
8. `TRG_DBUP_BLOCK_UNTRUSTED_LOGIN` bloquea el uso de `{DBUP_USER}` desde origenes no autorizados.
9. `TRG_BLOCK_MANUAL_DDL` bloquea intentos manuales sobre schemas protegidos.

## Estructura de carpetas

```text
dbup/ddl
├── shared
│   ├── ENTIDAD700
│   └── PARAM700
├── dev
│   ├── ENTIDAD700
│   └── PARAM700
├── qa
│   ├── ENTIDAD700
│   └── PARAM700
└── uat
    ├── ENTIDAD700
    └── PARAM700
```

Cada entidad puede tener scripts propios porque no todas comparten las mismas estructuras. GitLab valida que la entidad de la carpeta coincida con el header `TARGET_SCHEMA`.

## Variables CI requeridas

Configurar en GitLab como variables protegidas/enmascaradas:

```text
DEV_AWS_REGION
DBUP_SQLCL_IMAGE
DB_USER
DB_PASSWORD
DB_SERVICES_NAME
DB_PORT
DBUP_DEV_HOST
DBUP_QA_HOST
DBUP_UAT_HOST
```

El script arma internamente el connect string de SQLcl con este formato:

```text
DB_USER/DB_PASSWORD@//DBUP_<ENV>_HOST:DB_PORT/DB_SERVICES_NAME
```

`DBUP_SQL_CMD` queda definido por defecto como `sql` en el pipeline. Solo haria falta cambiarlo si en otra imagen el ejecutable de SQLcl tuviera otro nombre o ruta.

`DB_USER` debe apuntar al usuario tecnico de despliegue, normalmente `{DBUP_USER}`.

La imagen base esperada para ejecutar DDL es la publicada en ECR Public:

```text
{DBUP_SQLCL_IMAGE}
```

## Pendientes de definicion

- Confirmar si la imagen SQLcl queda fija como `latest` o si conviene taguearla por version.
- Politica de approvals por ambiente.
- Lista inicial de schemas protegidos o confirmacion del patron `^(ENTIDAD|PARAM)[0-9]{3}$`.
- Si `DBUP_CHANGELOG` vive en un schema central o en cada ambiente.
- Estrategia de rollback para cambios destructivos.
- Diseno del proyecto PROD separado y mecanismo para tomar un commit/tag validado en UAT.
