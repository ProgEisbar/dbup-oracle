# DBUP UI

Interfaz web para gestionar el flujo DBUP DDL sobre GitLab.

## Arquitectura

```
┌─────────────┐     cookie httpOnly      ┌──────────────┐     Bearer token     ┌─────────────┐
│   Browser   │ ◄──────────────────────► │  Express API │ ◄──────────────────► │  GitLab API │
│  (React)    │    NO tokens en JS       │  (server/)   │   Token server-side  │             │
└─────────────┘                          └──────────────┘                      └─────────────┘
     :5173                                    :3001                          gitlab.com/api/v4
```

**Seguridad:** El token OAuth de GitLab NUNCA llega al browser. Solo un cookie httpOnly
(no accesible via JavaScript) viaja entre el frontend y el backend.

## Requisitos

- [Node.js 18.19+](https://nodejs.org/) (LTS recomendado)
- GitLab OAuth Application (ver configuracion abajo)

## Configuracion rapida

### 1. Crear la OAuth App en GitLab

1. Ir al grupo DBUP DDL en GitLab → Settings → Applications
2. Crear nueva aplicacion:
   - **Name:** DBUP UI
   - **Redirect URI:** `http://localhost:3001/auth/callback`
   - **Scopes:** `api`
   - **Confidential:** SI
3. Guardar el **Application ID** y el **Secret**

### 2. Configurar el backend

```bash
cd server
cp .env.example .env
# Editar .env con tu Application ID y Secret
npm install
```

### 3. Configurar el frontend

```bash
# En la raiz de dbup-ui/
npm install
```

No hace falta crear un `.env` del frontend para desarrollo normal. El navegador
usa rutas relativas (`/auth` y `/api`) y Vite las reenvia al backend. Si se
necesita cambiar puertos, host o usar una API en otro dominio, copiar
`.env.example` a `.env` y ajustar sus valores.

Variables opcionales del frontend:

| Variable | Default | Uso |
|----------|---------|-----|
| `VITE_API_URL` | vacia | Origen o prefijo publico de la API |
| `VITE_PUBLIC_BASE` | `/` | Subruta donde se publica la SPA |
| `DEV_SERVER_HOST` | `localhost` | Host local de Vite |
| `DEV_SERVER_PORT` | `5173` | Puerto local de Vite |
| `BACKEND_PROXY_TARGET` | `http://localhost:3001` | Backend usado por el proxy local |

### 4. Arrancar ambos

En dos terminales:

```bash
# Terminal 1 - Backend (puerto 3001)
cd dbup-ui
npm run dev:api

# Terminal 2 - Frontend (puerto 5173)
cd dbup-ui
npm run dev
```

Abrir http://localhost:5173 → click "Iniciar sesion con GitLab"

## Configuracion portable

No hay rutas absolutas del disco en la aplicacion. La estructura de GitLab y
DBUP se define en `server/.env`, usando `server/.env.example` como plantilla:

| Variable | Ejemplo | Uso |
|----------|---------|-----|
| `GITLAB_GROUP_PATH` | `grupo/subgrupo/dbup-ddl` | Grupo raiz permitido |
| `DBUP_ENVIRONMENTS` | `DEV,QA,UAT` | Subgrupos de ambientes |
| `DBUP_ENTITIES` | `700,701,702,703` | Entidades disponibles |
| `DBUP_SCHEMA_TYPES` | `ENTIDAD,PARAM` | Tipos de schema |
| `DBUP_DEFAULT_BRANCH` | `main` | Rama usada por defecto |
| `DBUP_DDL_ROOT` | `dbup/ddl` | Carpeta raiz de DDL |
| `DBUP_ROLLBACK_ROOT` | `dbup/rollback` | Carpeta raiz de rollback |
| `DBUP_TEMPLATE_ROOT` | `templates/dev` | Carpeta de templates |
| `DBUP_PROJECT_PREFIX` | `entidad` | Prefijo para detectar repositorios |
| `DBUP_TEMPLATE_ENVIRONMENT` | `DEV` | Ambiente del repo maestro de templates |
| `DBUP_TEMPLATE_ENTITY` | `700` | Entidad del repo maestro de templates |
| `DBUP_TICKET_PREFIX` | `DBUP` | Prefijo de tickets |

Los valores tienen defaults compatibles con la instalacion actual, por lo que
los compañeros normalmente solo deben configurar credenciales, grupo GitLab y
`SESSION_SECRET`. Ningun valor de `server/.env` se incorpora al bundle del
navegador; el backend expone unicamente metadatos DBUP no sensibles.

## Estructura del proyecto

```
dbup-ui/
├── server/                      Backend API (Express proxy)
│   ├── src/
│   │   ├── app.js               Construccion de la app Express
│   │   ├── index.js             Entry point
│   │   ├── config.js            Variables de entorno
│   │   ├── middleware/
│   │   │   ├── auth.js          Guard: requireAuth
│   │   │   ├── cors.js          CORS con credentials
│   │   │   └── session.js       express-session (httpOnly cookie)
│   │   ├── routes/
│   │   │   ├── auth.js          OAuth login/callback/logout/me
│   │   │   ├── proxy.js         Proxy generico a GitLab API
│   │   │   └── index.js         Route aggregator
│   │   └── services/
│   │       ├── gitlab.js        Server-side GitLab API client
│   │       └── session.js       Helpers de persistencia de sesion
│   ├── test/                     Integracion OAuth/proxy
│   ├── package.json
│   ├── .env                     Credenciales (NO commitear)
│   └── .env.example
├── src/                         Frontend (React + Vite)
│   ├── services/
│   │   └── api.js               HTTP client → backend (cookie-based)
│   ├── context/
│   │   └── AppContext.jsx       Estado global + auth
│   ├── components/              Layout, Sidebar, Modal, StatusBadge...
│   └── pages/
│       ├── LoginPage.jsx        Login con GitLab OAuth
│       ├── OAuthCallback.jsx    Muestra errores OAuth seguros
│       ├── Dashboard.jsx        Matriz 3x4 pipelines
│       ├── NewScript.jsx        Wizard para subir DDL
│       ├── Templates.jsx        Gestion de .sql.tpl + distribute
│       ├── Pipelines.jsx        Ver/ejecutar pipelines y jobs
│       ├── History.jsx          Explorar scripts existentes
│       └── Config.jsx           Info de usuario y settings
├── package.json
├── vite.config.js
├── tailwind.config.js
└── .env                         Configuracion opcional de Vite
```

## Flujo de autenticacion

1. Usuario click "Iniciar sesion con GitLab"
2. Browser navega a `GET /auth/login` del backend
3. Backend genera y guarda state CSRF antes de redirigir a GitLab
4. Usuario autoriza la aplicacion en GitLab
5. GitLab envia code+state directamente a `GET /auth/callback` del backend
6. Backend consume state, guarda code brevemente en la sesion y vuelve al loader de la SPA
7. El loader llama a `POST /auth/complete`; el backend consume code una sola vez,
   lo intercambia por token y rota el ID de sesion
8. Backend guarda access/refresh token y el frontend carga la aplicacion
9. Frontend recibe solo usuario/configuracion segura (NUNCA tokens ni code)
9. El backend renueva el access token antes de vencer
10. Todas las llamadas subsiguientes van al backend con la cookie httpOnly

## Funcionalidades

| Pagina        | Descripcion                                                      |
|---------------|------------------------------------------------------------------|
| Dashboard     | Estado de pipelines en tiempo real (3 ambientes x 4 entidades)   |
| Nuevo Script  | Wizard guiado: genera nombre, headers, sube .sql al repo         |
| Templates     | CRUD de plantillas .sql.tpl + ejecutar distribute:dev            |
| Pipelines     | Ver pipelines, ejecutar jobs manuales, cancel/retry, ver logs    |
| Historial     | Explorar scripts existentes con busqueda y preview               |
| Config        | Info del usuario logueado, repos accesibles, settings            |

## Commits con auditoria

Todos los commits realizados desde la app quedan firmados con el usuario real de GitLab
(nombre + email), no con un bot o token compartido. Esto permite trazabilidad completa
de quien hace cada cambio.

## Build para produccion

```bash
# Frontend
npm run build    # genera dist/

# Backend
cd server
npm start        # o usar PM2, Docker, etc.
```

En produccion:
- `COOKIE_SECURE=true` (requiere HTTPS)
- `SESSION_SECRET` largo y unico
- Configurar `FRONTEND_URL`, `BACKEND_URL` y `OAUTH_REDIRECT_URI`
- Registrar exactamente `OAUTH_REDIRECT_URI` en GitLab
- Configurar `REDIS_URL` (obligatorio con `NODE_ENV=production`)
- Si frontend y API comparten dominio mediante reverse proxy, dejar
  `VITE_API_URL` vacia. Si usan dominios separados, definirla antes del build.
- Para publicar bajo una subruta, configurar `VITE_PUBLIC_BASE` y reflejar esa
  subruta en `FRONTEND_URL`. Si la API tambien usa una subruta publica,
  incluirla en `BACKEND_URL` y `OAUTH_REDIRECT_URI`.
