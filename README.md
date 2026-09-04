# DBUP Oracle

Plataforma para administrar despliegues DDL sobre Oracle mediante repositorios GitLab, pipelines CI/CD y SQLcl. DBUP organiza los cambios por ambiente y entidad, valida quién puede iniciar una conexión de despliegue, registra cada ejecución y ofrece una interfaz web para operar el flujo.

## Arquitectura

```text
BaseDeDatos/      Objetos Oracle de control, auditoría y seguridad.
dbup-ui/          Aplicación web React y API Node.js.
gitlab-repos/     Template y ejemplos de repositorios CI/CD por ambiente y entidad.
```

### Objetos Oracle

`BaseDeDatos/` instala los componentes que respaldan el proceso de despliegue:

- usuario y rol técnico configurables;
- secuencia y tabla `DBUP_CHANGELOG` para registrar cambios;
- allowlist `DBUP_ALLOWED_CLIENTS`;
- auditoría de conexiones en `DBUP_LOGIN_AUDIT`;
- triggers para controlar DDL fuera del flujo autorizado;
- script orquestador `000_deploy_base_de_datos.sql`.

### Pipeline CI/CD

Los modelos de `gitlab-repos/` proporcionan:

- definición de pipeline en `.gitlab-ci.yml`;
- scripts SQLcl en `ci/*.sh`;
- estructura para DDL por ambiente y entidad;
- templates SQL reutilizables;
- jobs de despliegue, distribución y promoción;
- definición de una imagen con Java y SQLcl.

La construcción reutilizable de esa imagen se mantiene por separado en
[`oracle-sqlcl-ecr-runner`](https://github.com/ProgEisbar/oracle-sqlcl-ecr-runner).
DBUP la consume mediante `DBUP_SQLCL_IMAGE`, sin incorporar credenciales ni
configuración de red en el contenedor.

### Interfaz web

`dbup-ui/` combina React, Vite y una API Express para:

- consultar pipelines y su estado;
- crear scripts DDL y templates;
- distribuir cambios entre entidades;
- iniciar jobs manuales;
- consultar el historial de despliegues.

La API utiliza sesiones, Redis y la integración de GitLab para centralizar las operaciones disponibles desde la interfaz.

## Flujo de trabajo

1. Preparar Oracle con los scripts de `BaseDeDatos/`.
2. Crear los repositorios de despliegue desde `gitlab-repos/template-base`.
3. Configurar las variables protegidas del pipeline.
4. incorporar DDL bajo `dbup/ddl/<ambiente>/<entidad>`.
5. validar y desplegar el cambio en el ambiente de origen.
6. promover los scripts aprobados a los ambientes siguientes.
7. consultar el resultado en `DBUP_CHANGELOG` o desde la interfaz web.

## Configuración

Los datos de cada instalación se suministran mediante parámetros y variables externas:

- conexión Oracle: `DB_USER`, `DB_PASSWORD`, `DB_PORT`, `DB_SERVICES_NAME` y `DBUP_<AMBIENTE>_HOST`;
- imagen del runner: `{DBUP_SQLCL_IMAGE}` y `{DBUP_ECR_REPOSITORY}`;
- ejecución CI/CD: `{DBUP_RUNNER_TAG}` y variables protegidas de GitLab;
- interfaz web: archivo `.env` creado a partir de `.env.example`;
- clientes autorizados: `{IP_RUNNER}`, `{USUARIO_RUNNER}`, `{HOST_RUNNER}`, `{IP_USUARIO}`, `{USUARIO}` y `{HOST_USUARIO}`.

Las credenciales deben administrarse mediante variables protegidas o un gestor de secretos. Los archivos versionados conservan únicamente nombres de parámetros y valores de ejemplo.

## Desarrollo de la interfaz

Requiere Node.js 18.19 o superior.

```bash
cd dbup-ui
npm install
npm run dev
```

Para iniciar la API en modo desarrollo:

```bash
npm run dev:api
```

Pruebas del backend:

```bash
npm test
```
