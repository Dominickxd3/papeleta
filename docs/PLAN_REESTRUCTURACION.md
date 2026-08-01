# PLAN DE REESTRUCTURACIÓN — FASE 2

**Sistema:** Papeletas de Permiso — Grupo Pecuario S.A.C.
**Fecha:** 2026-07-31
**Objetivo:** Reorganizar el backend y frontend existentes manteniendo compatibilidad total de contrato (endpoints, payloads, páginas). Sin cambios de lógica de negocio.

---

## 1. PRINCIPIOS RECTORES

1. **Compatibilidad total**: los endpoints y respuestas JSON actuales NO cambian de forma ni de contrato. El frontend actual debe seguir funcionando contra el nuevo backend sin tocar sus llamadas.
2. **Zero Downtime**: cada fase es desplegable de forma independiente (el código nuevo convive con el viejo vía rutas).
3. **No se altera lógica de negocio**: numeración, cruce de horarios, estados, auditoría, notificaciones → idénticas.
4. **Migración progresiva**: los módulos se mueven de `routes/*.routes.js` a `src/` por dominio, sin cortar el sistema.

---

## 2. ARQUITECTURA OBJETIVO

```
backend/
├── server.js                  → bootstrap mínimo: config, app, arranque
├── ecosystem.config.cjs       → PM2 (sin cambio)
├── .env / .env.example        → (sin cambio)
└── src/
    ├── app.js                 → construye la app Express (recibe config/pool)
    ├── config/
    │   ├── index.js           → lectura de env (un solo punto)
    │   ├── database.js        → config SQL Server + pool factory
    │   └── constants.js       → roles, estados, tamaños de papel, límites
    ├── database/
    │   ├── pool.js            → gestión del pool mssql (limits, health)
    │   ├── query.js           → helpers (safeExecute, transacciones)
    │   └── schema-cache.js    → detección de columnas (cache TTL)
    ├── middlewares/
    │   ├── auth.js            → requireAuth, authorizeRoles (sin cambio de mecanismo)
    │   ├── error-handler.js   → manejador global (mueve el de server.js)
    │   ├── not-found.js       → 404 (mueve el de server.js)
    │   └── request-logger.js  → logs dev
    ├── routes/                → SOLO definen paths y delegan al controller
    │   ├── index.js           → registra todos los módulos
    │   ├── auth.routes.js
    │   ├── papeletas.routes.js
    │   ├── usuarios.routes.js
    │   ├── trabajadores.routes.js
    │   ├── catalogos.routes.js
    │   ├── monitoring.routes.js
    │   └── system.routes.js
    ├── controllers/           → reciben (req,res) y orquestan servicio
    │   ├── auth.controller.js
    │   ├── papeletas.controller.js
    │   ├── usuarios.controller.js
    │   ├── trabajadores.controller.js
    │   ├── catalogos.controller.js
    │   ├── monitoring.controller.js
    │   └── system.controller.js
    ├── services/              → lógica de negocio (invocada por controllers)
    │   ├── auth.service.js
    │   ├── papeletas.service.js
    │   ├── usuarios.service.js
    │   ├── trabajadores.service.js
    │   ├── activity.service.js  (ya existe)
    │   ├── password.service.js  (ya existe)
    │   ├── time.service.js      (ya existe)
    │   └── notifications.service.js
    ├── repositories/          → SOLO acceso a datos (SQL/SP)
    │   ├── papeletas.repository.js
    │   ├── usuarios.repository.js
    │   ├── trabajadores.repository.js
    │   ├── catalogos.repository.js
    │   └── auditoria.repository.js
    ├── validators/            → validación de payloads (sin lógica de negocio)
    │   ├── papeletas.validator.js
    │   ├── usuarios.validator.js
    │   └── auth.validator.js
    ├── security/
    │   ├── policy.js          → canCreatePapeleta(), canEditPapeleta(), etc.
    │   ├── roles.js           → normalizeRole, isPrivilegedRole (único punto)
    │   └── rate-limit.js      → límite de intentos de login
    └── utils/
        ├── formatters.js      → fechas, horas, respuestas
        ├── response.js        → ok/error normalizados
        └── errors.js          → AppError + mapeo a HTTP
```

---

## 3. MAPEO: CÓDIGO ACTUAL → MÓDULO OBJETIVO

### 3.1 server.js (484 líneas)

| Línea actual | Destino |
|---|---|
| `loadEnvFile()` | `src/config/index.js` |
| Config SQL (138-148) | `src/config/database.js` |
| CORS + JSON body (90-109) | `src/app.js` |
| APP_BASE_PATH / subpath (53-66, 113-120) | `src/config/index.js` + `src/app.js` |
| uploads estático (122-127) | `src/app.js` |
| logs (130-135) | `src/middlewares/request-logger.js` |
| `connectDB()` (159-177) | `src/database/pool.js` |
| `createAuthTools` (179-207) | `src/middlewares/auth.js` (ya existe, se mueve) |
| `getProfilePhotoUrl` + caché (209-248) | `src/services/usuarios.service.js` o `src/utils/photo.js` |
| registro de rutas (254-324) | `src/routes/index.js` |
| estáticos y páginas (329-415) | `src/app.js` (helper `registerFrontend(app)`) |
| error handler (418-429) | `src/middlewares/error-handler.js` |
| 404 (432-444) | `src/middlewares/not-found.js` |
| arranque/SIGINT (447-460) | `server.js` (adelgazado) |

### 3.2 papeletas.routes.js (1835 líneas) → 6 módulos

| Código actual | Módulo objetivo |
|---|---|
| `GET/POST/PUT/DELETE/PATCH ...` definición de rutas | `routes/papeletas.routes.js` (≈ 100 líneas) |
| Parsing de query y body, códigos HTTP | `controllers/papeletas.controller.js` |
| `findHorarioConflict`, `extractVacacionesRange`, `getErpAreaAccess`, numeración, transacciones | `services/papeletas.service.js` |
| `SELECT/INSERT/UPDATE` y llamadas a SP | `repositories/papeletas.repository.js` |
| `parseDateTimeInput`, `convertirHoraSQL`, `isClosedPapeleta`, `canEditClosedPapeleta` | `validators/papeletas.validator.js` + `security/policy.js` |
| `getFriendlySqlErrorMessage` | `utils/errors.js` |
| Generación Excel (500-891) | `services/papeletas.excel.service.js` (o `services/export/papeletas-excel.js`) |
| Generación PDF (1328-1727) | `services/papeletas.pdf.service.js` (o `services/export/papeletas-pdf.js`) |
| `porEstadoCache`, `schemaCache`, `vacacionesSchemaCache` | `database/schema-cache.js` |

### 3.3 auth.routes.js (416 líneas)

| Código actual | Módulo objetivo |
|---|---|
| Rutas `/api/auth/*` | `routes/auth.routes.js` |
| `isErpUserActive`, `matchesErpPassword`, `resolveErpAccess`, `roleFromSwNivel` | `services/auth.service.js` |
| `logErpAudit`, `ensureErpAuditTable`, `auditAuthAttempt` | `services/auth.service.js` + `repositories/auditoria.repository.js` |
| `POST login`, `GET verify` | `controllers/auth.controller.js` |
| Parámetros `sql.VarChar` de búsqueda | `repositories/auth.repository.js` (nuevo, extrae SQL de la vista) |

### 3.4 usuarios.routes.js (605 líneas)

| Código actual | Módulo objetivo |
|---|---|
| Rutas `/api/usuarios/*` y `/api/usuarios-erp/*` | `routes/usuarios.routes.js` |
| `assertAdmin`, `swNivelFromRolApp`, `normalizeErpActivo` | `security/policy.js` + `security/roles.js` |
| Queries de usuarios y ERP | `repositories/usuarios.repository.js` |
| Foto de perfil (base64, 2MB, prefijos user-/erp-) | `services/usuarios.service.js` + `utils/photo.js` |
| Cambio de contraseña | `controllers/usuarios.controller.js` + `repositories/usuarios.repository.js` |

### 3.5 trabajadores.routes.js (306 líneas)

| Código actual | Módulo objetivo |
|---|---|
| Rutas `/api/trabajadores/*` | `routes/trabajadores.routes.js` |
| `queryTrabajadoresTodos/Vigentes`, `getSyncSummaryFromCache`, `runTrabajadoresSync` | `services/trabajadores.service.js` + `repositories/trabajadores.repository.js` |
| Guard `syncPromise` (single-flight) | `services/trabajadores.service.js` |

### 3.6 catalogos.routes.js (77) / monitoring.routes.js (156) / system.routes.js (135)

| Módulo actual | Destino |
|---|---|
| Catalogos | `controllers/catalogos.controller.js` + `repositories/catalogos.repository.js` |
| Monitoring (notificaciones, auditoría) | `controllers/monitoring.controller.js` + `repositories/monitoring.repository.js` |
| System (estadísticas, health, index API) | `controllers/system.controller.js` + `repositories/system.repository.js` |

---

## 4. FLUJO DE UNA PETICIÓN (DESPUÉS)

```
HTTP → routes/papeletas.routes.js (define path)
     → middlewares/auth.js (requireAuth)          [no cambia]
     → security/policy.js (canXxx() según acción)  [FASE 3]
     → validators/papeletas.validator.js (payload) [FASE 3+]
     → controllers/papeletas.controller.js (coordina)
     → services/papeletas.service.js (negocio)
     → repositories/papeletas.repository.js (SQL/SP)
     → response utils (ok/error)
```

Las rutas dejan de contener SQL. Los controladores dejan de contener SQL. Los servicios contienen reglas. Los repositorios contienen SQL.

---

## 5. ESTRATEGIA DE MIGRACIÓN (INCREMENTAL Y NO ROMPEDORA)

### Fase 2a — Scaffolding (sin tocar rutas actuales)
1. Crear `backend/src/` con la estructura.
2. Mover helpers puros (roles, formatters, errors, time, password) a `src/`.
3. Los `routes/*.routes.js` actuales importan esos helpers desde `src/` (misma ruta de require, mismo comportamiento).

### Fase 2b — Migración por dominio (uno a la vez)
1. **Catalogos** (más simple) → mover a `src/` completo; des-registrar el viejo.
2. **System** → mover.
3. **Trabajadores** → mover.
4. **Auth** → mover (máxima atención: login).
5. **Usuarios** → mover.
6. **Papeletas** (el más grande) → mover por partes:
   - Primero `mostrar/listar/ultimo-numero/por-estado` (solo lectura).
   - Luego `insertar/editar/eliminar/restaurar/gestionar` (escritura).
   - Luego `reporte/:id` y `historial`.
   - Luego `exportar-excel`.
   - Luego `:id/pdf`.

### Fase 2c — `server.js` adelgazado
Al final, `server.js` solo: carga config, crea pool, crea app (`src/app.js`), arranca.

> **Regla de oro de la migración**: en cada sub-paso, ejecutar la suite de smoke tests de la FASE 6 y comparar respuestas antes/después (mismo status code, mismo shape, mismos mensajes).

---

## 6. FRONTEND OBJETIVO (FASE 5, resumen)

```
js/
├── core/
│   ├── api-client.js      (sin cambio de contrato)
│   ├── auth-guard.js      (unifica guards de rol por página)
│   └── error-handler.js   (manejo centralizado de errores)
├── api/                   (clientes HTTP — los actuales se consolidan)
├── services/              (negocio reutilizable — eliminar duplicados muertos)
├── controllers/           (uno por página, sin lógica SQL/API inline)
├── views/                 (render DOM)
├── components/            (tabla, modal, autocomplete, notificaciones)
└── utils/                 (formatters, validators, constantes)
```

Eliminación de código muerto (confirmado que ningún HTML lo carga):
- `js/api/reportes.api.js` (usa `apiClient` inexistente)
- `js/controllers/dashboard.controller.js`
- `js/controllers/formulario-papeleta.slide.controller.js`
- `js/controllers/papeleta-slide.controller.js`
- `js/controllers/papeletas.controller.js` (duplica `PermisosController`)
- `js/services/formulario-papeleta.js`
- `js/services/reportes.service.js`
- `js/services/trabajadores-cache.service.js`
- `js/slides/trabajadores.service.js`
- `js/views/autocomplete.view.js`

Consolidación:
- `class PermisosController` → solo `permisos.controller.js`.
- Formateadores → solo `utils/formatters.js`.
- `normalizeRole` → `core/auth-guard.js` (único punto).

---

## 7. RIESGOS DE LA REESTRUCTURACIÓN Y MITIGACIÓN

| Riesgo | Mitigación |
|---|---|
| Cambiar un mensaje/status HTTP al mover código | Smoke tests que comparan antes/después (FASE 6) |
| Romper login ERP al extraer `auth.service` | Tests de contrato sobre fixtures de `User_PassBin` (todos los formatos) |
| Regresión en numeración concurrente | Tests de concurrencia (2 inserciones simultáneas) |
| `mssql` pool global compartido | Extraer `database/pool.js` con límites explícitos (`max: 10, min: 2, idleTimeoutMillis`) |
| Scripts SQL/SP no versionados | Incluir en el repo los scripts DDL/DML usados + documentar dependencias de SP |
| Código muerto que confunde | Eliminarlo solo después de verificar `grep` que ningún HTML lo referencia |

---

## 8. CRITERIOS DE "HECHO" POR DOMINIO

Un dominio se considera migrado cuando:
- [ ] Todas sus rutas viven en `src/routes/`.
- [ ] El controller no contiene SQL.
- [ ] El repository no contiene lógica de negocio.
- [ ] Las políticas de acceso están en `src/security/`.
- [ ] Los smoke tests del dominio pasan (200/400/401/403/404 correctos).
- [ ] El contrato JSON es idéntico al actual (verificado con diff).
- [ ] No hay referencias al archivo original en `server.js`.

*Fin del plan FASE 2. No se realizó ningún cambio de código todavía.*
