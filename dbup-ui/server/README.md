# DBUP API Server

Backend Express que actua como proxy seguro entre el frontend y la API de GitLab.

## Arquitectura de seguridad

```
Browser  <-- cookie httpOnly -->  Express  <-- Bearer token -->  GitLab API
```

- El token OAuth de GitLab NUNCA llega al browser
- El browser solo recibe una cookie de sesion httpOnly (no accesible via JS)
- El backend hace el intercambio de codigo por token usando el client_secret
- Todas las llamadas a GitLab pasan por el proxy

## Requisitos

- Node.js 18.19+
- GitLab OAuth Application configurada como "Confidential" (con client_secret)

## Configuracion

1. Crear la OAuth Application en GitLab:
   - GitLab -> grupo DBUP DDL -> Settings -> Applications -> New application
   - Name: `DBUP UI`
   - Redirect URI: `http://localhost:3001/auth/callback`
   - Scopes: `api`
   - Confidential: SI (esto genera un client_secret)
   - Guardar el Application ID y el Secret

2. Copiar `.env.example` a `.env` y completar:

```bash
cp .env.example .env
```

3. Editar `.env`:

```env
GITLAB_BASE_URL=https://gitlab.com
GITLAB_CLIENT_ID=tu_application_id
GITLAB_CLIENT_SECRET=tu_client_secret
GITLAB_GROUP_PATH=grupo/subgrupo/dbup-ddl

NODE_ENV=development
PORT=3001
SESSION_SECRET=un-string-largo-aleatorio-minimo-32-caracteres
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3001
OAUTH_REDIRECT_URI=http://localhost:3001/auth/callback
OAUTH_CALLBACK_TTL_MS=120000

DBUP_ENVIRONMENTS=DEV,QA,UAT
DBUP_ENTITIES=700,701,702,703
DBUP_SCHEMA_TYPES=ENTIDAD,PARAM
DBUP_DEFAULT_BRANCH=main
DBUP_DDL_ROOT=dbup/ddl
DBUP_ROLLBACK_ROOT=dbup/rollback
DBUP_TEMPLATE_ROOT=templates/dev
DBUP_SHARED_FOLDER=shared
DBUP_PROJECT_PREFIX=entidad
DBUP_TEMPLATE_ENVIRONMENT=DEV
DBUP_TEMPLATE_ENTITY=700
DBUP_TICKET_PREFIX=DBUP
DBUP_DISTRIBUTE_JOB_NAME=distribute:dev
DBUP_ROLLBACK_JOB_PREFIX=rollback

COOKIE_SECURE=false
# REDIS_URL=redis://localhost:6379
```

## Instalacion y arranque

```bash
cd server
npm install
npm run dev
```

El servidor arranca en http://localhost:3001

Las variables `DBUP_*` describen la estructura de los repositorios y se pueden
cambiar sin modificar codigo. Las rutas son siempre relativas al repositorio
GitLab; nunca deben contener rutas locales de Windows o Linux.

## Endpoints

### Auth

| Metodo | Ruta            | Descripcion                               |
|--------|-----------------|-------------------------------------------|
| GET    | /auth/login     | Guarda state y redirige a GitLab          |
| GET    | /auth/callback  | Guarda code brevemente y vuelve al loader de la SPA |
| POST   | /auth/complete  | Consume code, crea la sesion autenticada           |
| GET    | /auth/me        | Devuelve el usuario autenticado           |
| POST   | /auth/logout    | Destruye la sesion                        |

### Proxy (requieren sesion activa)

| Metodo | Ruta                                       | GitLab API equivalente                    |
|--------|--------------------------------------------|-------------------------------------------|
| GET    | /api/groups/by-path?path=...               | GET /groups/:encoded_path                 |
| GET    | /api/groups/:id/subgroups                  | GET /groups/:id/subgroups                 |
| GET    | /api/groups/:id/projects                   | GET /groups/:id/projects                  |
| GET    | /api/projects/:id                          | GET /projects/:id                         |
| GET    | /api/projects/:id/pipelines                | GET /projects/:id/pipelines               |
| GET    | /api/projects/:id/pipelines/:pid           | GET /projects/:id/pipelines/:pid          |
| GET    | /api/projects/:id/pipelines/:pid/jobs      | GET /projects/:id/pipelines/:pid/jobs     |
| POST   | /api/projects/:id/pipelines/:pid/retry     | POST /projects/:id/pipelines/:pid/retry   |
| POST   | /api/projects/:id/pipelines/:pid/cancel    | POST /projects/:id/pipelines/:pid/cancel  |
| POST   | /api/projects/:id/pipeline                 | POST /projects/:id/pipeline               |
| POST   | /api/projects/:id/jobs/:jid/play           | POST /projects/:id/jobs/:jid/play         |
| POST   | /api/projects/:id/jobs/:jid/retry          | POST /projects/:id/jobs/:jid/retry        |
| POST   | /api/projects/:id/jobs/:jid/cancel         | POST /projects/:id/jobs/:jid/cancel       |
| GET    | /api/projects/:id/jobs/:jid/trace          | GET /projects/:id/jobs/:jid/trace         |
| GET    | /api/projects/:id/repository/tree          | GET /projects/:id/repository/tree         |
| GET    | /api/projects/:id/repository/files/*       | GET /projects/:id/repository/files/:path  |
| POST   | /api/projects/:id/repository/files/*       | POST (crear archivo)                      |
| PUT    | /api/projects/:id/repository/files/*       | PUT (actualizar archivo)                  |
| DELETE | /api/projects/:id/repository/files/*       | DELETE (eliminar archivo)                 |
| GET    | /api/projects/:id/repository/commits       | GET /projects/:id/repository/commits      |
| GET    | /health                                    | Health check                              |

## Produccion

Para produccion:

1. Setear `COOKIE_SECURE=true` (requiere HTTPS)
2. Usar un `SESSION_SECRET` largo y unico
3. Configurar `FRONTEND_URL`, `BACKEND_URL` y `OAUTH_REDIRECT_URI`
4. Registrar exactamente `OAUTH_REDIRECT_URI` como Redirect URI en GitLab
5. Configurar `REDIS_URL` (es obligatorio con `NODE_ENV=production`)

`FRONTEND_URL` y `BACKEND_URL` pueden incluir una subruta publica. Por ejemplo,
si la API se expone en `https://apps.example/dbup-api`, el callback debe ser
`https://apps.example/dbup-api/auth/callback`. El reverse proxy puede retirar
ese prefijo antes de reenviar la solicitud a Express.
