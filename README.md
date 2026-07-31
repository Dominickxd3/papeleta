# Sistema de Papeletas de Permiso — Grupo Pecuario

Sistema web para la gestión de papeletas de permiso de salida del personal de **Grupo Pecuario S.A.C.** Permite registrar, aprobar, rechazar e imprimir papeletas de permiso, administrar trabajadores, usuarios y generar reportes.

## Características

- **Registro de papeletas** con autocompletado de trabajador por DNI o nombre.
- **Flujo de aprobación** en 2 niveles (Jefe / RRHH) y rechazo con motivo.
- **Impresión de papeletas** en formato triplicado (Colaborador, Vigilancia, RRHH) en A4 o A5.
- **Exportación de reportes** a Excel (mensual, filtrado por área/estado).
- **Panel de estadísticas** (dashboard) con gráficos por área, mes y usuarios.
- **Directorio de trabajadores** con sincronización desde el ERP.
- **Administración de usuarios** y roles, perfil y cambio de contraseña.
- **Autenticación JWT** con cierre de sesión por inactividad.
- **Diseño responsivo** con modo oscuro y soporte PWA (manifest + service worker).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | HTML, CSS, JavaScript (vanilla), SweetAlert2, Chart.js |
| Backend | Node.js, Express 5 |
| Base de datos | SQL Server (mssql) |
| Autenticación | JSON Web Token (JWT) |
| Reportes | PDFKit (PDF), ExcelJS (Excel) |
| Procesos | PM2 |

## Estructura del proyecto

```
.
├── backend/                # API (Express + SQL Server)
│   ├── middlewares/        # Autenticación y validaciones
│   ├── routes/             # Rutas de la API
│   ├── services/           # Lógica de negocio
│   ├── uploads/            # Archivos subidos (fotos, etc.)
│   ├── server.js           # Punto de entrada
│   └── ecosystem.config.cjs # Configuración PM2
├── HTML/                   # Páginas del sistema
├── css/                    # Estilos (base, layout, componentes, páginas)
├── js/                     # Cliente API, servicios, controladores y vistas
├── img/                    # Imágenes (logo, iconos)
├── icons/                  # Iconos PWA
├── index.html              # Página de login
├── manifest.webmanifest    # Manifiesto PWA
├── web.config              # Configuración IIS
├── robots.txt
└── sitemap.xml
```

## Requisitos previos

- Node.js 18 o superior
- SQL Server (2016+)
- PM2 (opcional, para producción): `npm install -g pm2`

## Configuración

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/Dominickxd3/papeleta.git
   cd papeleta
   ```

2. Configurar variables de entorno:

   ```bash
   cd backend
   cp .env.example .env
   ```

3. Editar `backend/.env` con los valores de tu entorno:

   ```env
   # SQL Server
   DB_USER=sa
   DB_PASSWORD=tu_password
   DB_SERVER=localhost
   DB_NAME=DB_GP_Trabajos
   DB_ENCRYPT=false
   DB_TRUST_CERT=true

   # API
   PORT=3000
   HOST=127.0.0.1

   # JWT
   JWT_SECRET=genera_un_secreto_largo_y_aleatorio
   JWT_EXPIRES_IN=12h
   JWT_ISSUER=papeletas-gp
   JWT_AUDIENCE=papeletas-gp-web
   ```

> **Nota de seguridad:** `backend/.env` contiene credenciales reales y **no** debe subirse al repositorio (está incluido en `.gitignore`). Usa siempre `.env.example` como plantilla.

## Instalación y ejecución

### Backend

```bash
cd backend
npm install
npm run dev        # desarrollo (nodemon)
npm start          # producción (node server.js)
```

La API se levanta en `http://127.0.0.1:3000/api`.

### Producción con PM2

```bash
npm run ops:start      # pm2 start ecosystem.config.cjs --only papeletas-api
npm run ops:status     # ver estado
npm run ops:restart    # reiniciar
npm run ops:logs       # ver logs
```

### Frontend

El frontend es estático (HTML/CSS/JS). Puedes servirlo con cualquier servidor web:

- **Local:** Live Server (VS Code) en el puerto 5500/5501 — el frontend detecta automáticamente y redirige la API a `http://localhost:3000`.
- **IIS:** publicar la raíz del proyecto bajo el sitio (usa `web.config`), con la API detrás de un reverse proxy en `/api`.

Abrir en el navegador: `http://localhost:5500/index.html`

## Scripts SQL

Los scripts de migración y mantenimiento de la base de datos viven en la raíz del proyecto (`*.sql`). Antes de importarlos, **verifica cada script** con el administrador de base de datos según el estado actual de tu esquema.

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/auth/verify` | Verificar token |
| GET | `/api/papeletas/listar` | Listar papeletas (filtros + paginación) |
| POST | `/api/papeletas/insertar` | Crear papeleta |
| PUT | `/api/papeletas/editar` | Editar papeleta |
| DELETE | `/api/papeletas/eliminar` | Anular papeleta |
| POST | `/api/papeletas/gestionar` | Aprobar / rechazar (RRHH) |
| GET | `/api/papeletas/:id/pdf` | Generar PDF de la papeleta |
| GET | `/api/papeletas/exportar-excel` | Exportar reporte Excel |
| GET | `/api/trabajadores/listar` | Listar trabajadores |
| POST | `/api/trabajadores/sync` | Sincronizar desde ERP |
| GET | `/api/estadisticas/general` | Estadísticas del dashboard |
| GET | `/api/health` | Estado del servicio |

## Nota sobre el estado del proyecto

Este repositorio contiene código en evolución: hay archivos legacy que no son cargados por las páginas actuales (código muerto) y doble implementación de algunos módulos (ej. `js/controllers/permisos.controller.js` y `js/controllers/papeletas.controller.js`). El código activo es el cargado por los HTML en `HTML/`. Antes de desplegar, se recomienda una limpieza y refactorización.

## Licencia

ISC
