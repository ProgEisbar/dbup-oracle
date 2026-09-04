# Archivos para Base de Datos

Estos scripts preparan Oracle para usar el flujo DBUP desde GitLab.

## Estructura

```text
BaseDeDatos/
└── dbup/
    └── admin/
        ├── install/   # Ejecutar en una base/ambiente nuevo
        ├── patches/   # Ejecutar solo sobre instalaciones ya existentes
        └── tools/     # Consultas o ayudas puntuales
```

## Orden para QA nuevo

Ejecutar con un usuario DBA desde `BaseDeDatos/dbup/admin/install`, ajustando
passwords/hosts antes de correr:

```text
000_deploy_base_de_datos.sql
```

Este archivo orquesta el deploy en este orden:

1. Usuario tecnico y rol DBUP.
2. Tablas de control/auditoria, secuencia, indices y trigger de changelog.
3. Grants al usuario tecnico.
4. Whitelist de clientes autorizados.
5. Sinonimos para `{DBUP_USER}`.
6. Triggers de seguridad, dejando `TRG_BLOCK_MANUAL_DDL` al final.

Los scripts individuales se mantienen para ejecucion manual o troubleshooting:

```text
dbup/admin/install/001_create_dbup_user.sql
dbup/admin/install/002_create_dbup_control_tables.sql
dbup/admin/install/003_grant_dbup_target_privileges.sql
dbup/admin/install/004_seed_allowed_clients.sql
dbup/admin/install/005_create_dbup_security_triggers.sql
```

Para QA, confirmar especialmente en `004_seed_allowed_clients.sql`:

```text
ENVIRONMENT = QA
IP_ADDRESS  = IP del runner QA
OS_USER     = appuser
HOST_NAME   = *
CLIENT_PROGRAM_NAME = SQLcl
```

## Carpetas

```text
install/
```

Scripts para instalar DBUP desde cero en un ambiente:

- `000_deploy_base_de_datos.sql`: orquestador del deploy completo de base.
- `001_create_dbup_user.sql`: crea `{DBUP_USER}` y `{DBUP_ROLE}`.
- `002_create_dbup_control_tables.sql`: crea `DBUP_CHANGELOG`, `DBUP_ALLOWED_CLIENTS`, `DBUP_LOGIN_AUDIT` y objetos asociados.
- `003_grant_dbup_target_privileges.sql`: grants necesarios para que `{DBUP_USER}` ejecute DDL/DML.
- `004_seed_allowed_clients.sql`: whitelist de GitLab y usuarios DBA autorizados.
- `005_create_dbup_security_triggers.sql`: trigger de logon DBUP y bloqueo DDL manual.

```text
patches/
```

Scripts de actualización para instalaciones existentes de DBUP:

- `007_alter_allowed_clients_os_user.sql`: agrega `OS_USER`, `HOST_NAME` y `CLIENT_PROGRAM_NAME`.
- `008_configure_dbup_allowed_clients_host.sql`: actualiza la allowlist y sus triggers sin recrear los objetos.
- `010_allow_truncate_in_manual_ddl_trigger.sql`: actualiza `TRG_BLOCK_MANUAL_DDL` para permitir `TRUNCATE` manual/batch sobre schemas protegidos.

Las instalaciones nuevas utilizan los scripts principales y no requieren `patches/`.

```text
tools/
```

Ayudas puntuales:

- `006_check_runner_ip.sql`: revisa auditoria de logon para detectar IP/host/programa reales.
- `009_grant_dbup_test_shared_dml.sql`: grant puntual sobre el objeto de prueba `DBUP-0002`, util solo si no se usan privilegios `ANY TABLE`.

## Nota

`{DBUP_USER}` no deberia tener rol `DBA`. Para el piloto se usan grants directos necesarios para DDL/DML y whitelist estricta por IP, OS user, host y programa cliente.

`TRG_BLOCK_MANUAL_DDL` bloquea DDL manual sobre schemas `ENTIDAD###` y `PARAM###`, pero permite `TRUNCATE` porque algunos procesos batch lo usan como operacion operativa normal.
