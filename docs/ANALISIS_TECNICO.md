# ANÁLISIS TÉCNICO DEL SISTEMA

**Sistema:** Papeletas de Permiso — Grupo Pecuario S.A.C.
**Autor:** Arquitecto de Software (auditoría sobre copia local)
**Fecha:** 2026-07-31
**Alcance:** Backend (Node.js/Express), Frontend (HTML/CSS/JS vanilla), Base de datos (SQL Server), Seguridad, Documentos e Impresión.
**Regla de oro:** No se modifica lógica de negocio, no se elimina funcionalidad, no se cambia el mecanismo de autenticación. Compatibilidad total.

---

## 1. ARQUITECTURA ACTUAL

### 1.1 Mapa de componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                       FRONTEND (estático)                        │
│  index.html (login) · HTML/permisos.html · HTML/formulario-      │
│  papeleta.html · HTML/dashboard.html · HTML/trabajadores.html ·  │
│  HTML/administrar.html · HTML/perfil.html · HTML/reporte.html    │
│  js/api/* (clientes HTTP) · js/services/* · js/controllers/*     │
│  js/views/* · js/utils/* · css/*                                 │
└───────────────▲─────────────────────────────────────────────────┘
                │ HTTP /api (JWT Bearer)  +  archivos estáticos
┌───────────────┴─────────────────────────────────────────────────┐
│                       BACKEND (Express 5)                        │
│  server.js ── monta pool mssql, CORS, auth, estáticos, rutas     │
│  routes/*.routes.js  (7 módulos, patrón factory con deps)        │
│  middlewares/auth.js (JWT)  services/* (auditoría, password)     │
└───────────────▲─────────────────────────────────────────────────┘
                │ mssql (driver v12)
┌───────────────┴─────────────────────────────────────────────────┐
│                     SQL SERVER (DB_GP_Trabajos_TEST)             │
│  TBL_GGHH_PapeletaPermiso · TBL_GGHH_TrabajadorCache ·           │
│  TBL_USUARIOS · TBL_USUARIOS_ERP_APP · TBL_ROLES_USUARIO_ERP ·   │
│  vw_ERP_Usuarios · TBL_AUDITORIA · TBL_NOTIFICACIONES ·          │
│  SP: insertar/editar/eliminar/mostrar/reporte_PapeletaPermiso_gp │
│      sp_login_usuario · sp_SyncTrabajadoresCache                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Patrón de construcción (backend)

Todos los módulos de rutas usan un **patrón factory**: `registerXxxRoutes(app, deps)` recibe un objeto de dependencias (`getPool`, `sql`, middlewares, servicios). Esto es la base correcta para la refactorización: los controladores ya existen como "functions de registro", solo que la lógica de negocio está mezclada dentro de los handlers.

### 1.3 Frontend: dos generaciones coexistentes

| Generación | Páginas | Características |
|---|---|---|
| Moderna | permisos, formulario-papeleta, dashboard, trabajadores, administrar, perfil | `api-client.js` + `fetch` + `getAuthHeaders`, arquitectura api/service/controller/view, SweetAlert2, sidebar compartido |
| Legacy | reporte.html | `permisos.api.js` (1020 líneas) + `permisos.controller.js` + `html2pdf.js` cliente |

---

## 2. FLUJO COMPLETO DE AUTENTICACIÓN

### 2.1 Flujo de login (`POST /api/auth/login`, `auth.routes.js`)

```
1. Validar presencia de usuario+contrasena.
2. Buscar usuario en TBL_USUARIOS (Activo='1'):
   ├─ Si existe y Contrasena está en formato pbkdf2$...
   │    → verificar local (password.service) + chequeo de Bloqueado.
   │    → Origen = LOCAL.
   └─ Si no hay usuario local o password no-hasheada:
        → execute sp_login_usuario (SP heredado).
        → Si falla: consulta vw_ERP_Usuarios por User_Logon:
             · isErpUserActive (estado)
             · matchesErpPassword: compara User_PassBin como
               utf8/utf16le/latin1/hex/base64 y UserPassText
             · resolveErpAccess → rol desde sw_nivel
               (nivel>=4 ADMIN, =3 RRHH, resto USUARIO)
             · Origen = ERP.
3. Si autenticado:
   - Registrar auditoría LOGIN_OK.
   - Generar JWT (HS256, 12h, issuer+audience).
   - Responder { token, usuario }.
4. Cualquier fallo → auditoría LOGIN_FAIL con origen y motivo.
```

### 2.2 Validación posterior (`requireAuth`, `middlewares/auth.js`)

- Token vía `Authorization: Bearer <token>`.
- `jwt.verify` con algoritmo fijo HS256, issuer y audience.
- Payload: `{ id, usuario, nombre, email, rol, sw_nivel, origen }`.
- Expiración: 12h (JWT_EXPIRES_IN).

### 2.3 Puntos críticos de autenticación

| # | Riesgo | Detalle |
|---|---|---|
| A1 | **Algoritmo de validación de contraseña ERP frágil** | `matchesErpPassword` prueba 5 codificaciones (utf8, utf16le, latin1, hex, base64) para adivinar el formato real de `User_PassBin`. Cambio de formato en el ERP rompe el login sin error claro. |
| A2 | **Fallo silencioso de fallback** | Si `vw_ERP_Usuarios` no existe/falla, el catch hace `console.warn` y continúa → el usuario ve "Credenciales inválidas" genérico sin pista de causa raíz. |
| A3 | **sp_login_usuario heredado** | Usado como paso 2 con contraseña en claro vía `.input('Contrasena')`. Depende de un SP que no es visible en el repo (no versionado). |
| A4 | **Usuario local con password en claro** | Si la fila en TBL_USUARIOS no usa formato `pbkdf2$...`, se salta la verificación local y cae al flujo SP/ERP. Puede haber cuentas locales con hash viejo o texto plano. |
| A5 | **Sin rate-limiting** | No hay límite de intentos de login (solo Bloqueado manual). Expuesto a fuerza bruta. |
| A6 | **Sin expiración forzada de sesión en servidor** | El logout/inactividad es solo del lado frontend (`api-client.js`, 5 min). Un token robado vale 12h. |
| A7 | **Mensajes con caracteres corruptos** | `Credenciales inv�lidas`, `contrase�a` (encoding roto en strings). |

---

## 3. FLUJO DE AUTORIZACIÓN

### 3.1 Mecanismo actual

- **Global**: todo `/api` exige `requireAuth`, excepto `/`, `/auth/login`, `/health` (`server.js:264`).
- **Por rol**: `authorizeRoles(['ADMIN','ADMINISTRADOR','ADMINISTRADOR DEL SISTEMA','RRHH','RR HH','RECURSOS HUMANOS'])` → instanciado como `requireAprobacionRole` y `requireTrabajadoresRole`.
- **Por acción** (dentro de handlers, no centralizado):
  - `papeletas/editar`: chequea `isClosedPapeleta(previo) && !canEditClosedPapeleta(user)`.
  - `papeletas/listar` y `exportar-excel`: filtran por área (sw_nivel=2 con áreas ERP) o por creador (IdUsuarioCreador) o por DOI/nombre/auditoría.
  - `usuarios-erp/*`: `assertAdmin(req,res)` dentro del handler.
  - `papeletas/restaurar` y `papeletas/gestionar`: middleware `requireAprobacionRole`.
  - `trabajadores/insertar|editar|eliminar`: `requireTrabajadoresRole` + respuesta 405 (deshabilitados).

### 3.2 Problemas de autorización

| # | Riesgo | Detalle |
|---|---|---|
| Z1 | **Autorización dispersa** | La lógica de "quién puede qué" está embebida en cada handler SQL. No hay una capa única y testeable. |
| Z2 | **Semántica de roles frágil** | `sw_nivel>=4 → ADMIN`, `=3 → RRHH`, resto `USUARIO`, duplicada en `auth.routes.js`, `papeletas.routes.js` y `usuarios.routes.js`. Un cambio de mapeo exige tocar 3 lugares. |
| Z3 | **`normalizeRole` duplicado** | Definido en `middlewares/auth.js`, `papeletas.routes.js`, `usuarios.routes.js` y en el frontend (role-guard). |
| Z4 | **El token no lleva el área** | El filtrado por área se consulta en BD por `UserLogon` en cada request (`getErpAreaAccess`). Sin caché de área → 2 consultas extra por request. |
| Z5 | **Imprimir PDF** | Controlado por estado `APROBADO_RRHH` en el handler del PDF, pero no por rol. Un USUARIO cualquiera con una papeleta aprobada puede bajarla (quizá aceptable, pero debe documentarse como política). |
| Z6 | **No hay políticas por acción** | No existen funciones tipo `canCreatePapeleta()`. Toda la lógica es `if/else` inline. |

---

## 4. DEPENDENCIAS

### 4.1 Backend (`backend/package.json`)

| Paquete | Versión | Estado | Nota |
|---|---|---|---|
| express | ^5.2.1 | OK | Framework |
| mssql | ^12.2.0 | OK | Driver SQL Server |
| jsonwebtoken | ^9.0.2 | OK | JWT |
| pdfkit | ^0.17.2 | OK | Generación PDF backend |
| exceljs | ^4.4.0 | OK | Exportación Excel |
| cors | ^2.8.5 | OK | CORS |
| nodemon | ^3.0.1 (dev) | OK | Dev |
| pm2 | ^5.4.3 (dev) | **OBSOLETO** | PM2 es runtime, debería estar en `dependencies`, no `devDependencies` |

### 4.2 Frontend

- **Sin build system** (sin npm en frontend): HTML/CSS/JS vanilla.
- CDN: SweetAlert2, FontAwesome 6.4, Chart.js 4.4.1, html2pdf.js 0.10.1, Google Fonts (Manrope), Tailwind (solo index.html).
- **Riesgo F1**: el uso de CDN en producción depende de internet externa. Un corte de CDN rompe el sistema (no hay fallback local).

### 4.3 Node/Entorno

- Node v24.11.1 / npm 11.12.0 detectados en la máquina local.
- PM2 `ecosystem.config.cjs`: 1 instancia, `fork`, `NODE_ENV=production`.

---

## 5. RELACIONES FRONTEND ↔ BACKEND ↔ DATABASE

### 5.1 Endpoints consumidos vs expuestos (consistencia)

| Endpoint | Backend | Frontend usa | Estado |
|---|---|---|---|
| POST /api/auth/login | ✔ | ✔ | OK |
| GET /api/auth/verify | ✔ | ✔ | OK |
| GET /api/papeletas/listar | ✔ | ✔ (fallback a /mostrar) | OK |
| GET /api/papeletas/mostrar | ✔ | ✔ (fallback) | OK |
| POST /api/papeletas/insertar | ✔ | ✔ | OK |
| PUT /api/papeletas/editar | ✔ | ✔ | OK |
| DELETE /api/papeletas/eliminar | ✔ | ✔ | OK |
| PATCH /api/papeletas/restaurar | ✔ | ✔ | OK |
| POST /api/papeletas/gestionar | ✔ | ✔ (aprobar/rechazar) | OK |
| GET /api/papeletas/:id/pdf | ✔ | ✔ | OK |
| GET /api/papeletas/reporte/:id | ✔ | ✔ | OK |
| GET /api/papeletas/:id/historial | ✔ | ✔ | OK |
| GET /api/papeletas/exportar-excel | ✔ | ✔ | OK |
| GET /api/papeletas/ultimo-numero | ✔ | ✔ | OK |
| GET /api/papeletas/por-estado | ✔ | ✔ (dashboard) | OK |
| GET /api/estadisticas/* | ✔ | ✔ | OK |
| GET /api/trabajadores/* | ✔ | ✔ | OK |
| POST /api/trabajadores/sync | ✔ | ✔ | OK |
| GET /api/notificaciones/mias | ✔ | ✔ | OK |
| PUT /api/notificaciones/:id/leido | ✔ | ✔ | OK |
| GET /api/auditoria/listar | ✔ | ? (admin) | OK |
| GET /api/usuarios/* | ✔ | ✔ | OK |
| GET /api/usuarios-erp/* | ✔ | ✔ | OK |
| GET /api/catalogos, /areas, /estados, /feriados, /configuracion, /horarios | ✔ | parcial | OK |
| GET /api/health, /api/health/database | ✔ | ✔ | OK |

### 5.2 Tablas SQL referenciadas

- TBL_GGHH_PapeletaPermiso (tabla principal)
- TBL_GGHH_TrabajadorCache (cache ERP, única fuente de trabajadores)
- TBL_USUARIOS (usuario local + creador)
- TBL_USUARIOS_ERP_APP (nivel/áreas de usuarios ERP)
- TBL_ROLES_USUARIO_ERP (legacy)
- TBL_USUARIO_ERP_AREA_APP / TBL_AREAS_ERP_APP (áreas por usuario sw_nivel=2)
- vw_ERP_Usuarios (vista ERP)
- TBL_AUDITORIA + TBL_USUARIOS_ERP_AUDITORIA (auditoría)
- TBL_NOTIFICACIONES
- TBL_TIPOS_PERMISO, TBL_ESTADOS_PAPELETA, TBL_FERIADOS, TBL_CONFIGURACION, TBL_HORARIOS (catálogos)

### 5.3 Stored procedures usados

- `insertar_PapeletaPermiso_gp`, `editar_PapeletaPermiso_gp`, `eliminar_PapeletaPermiso_gp`, `mostrar_PapeletaPermiso_gp`, `reporte_PapeletaPermiso_gp`
- `sp_login_usuario`, `sp_SyncTrabajadoresCache`

> **Riesgo D1**: Los SP críticos NO están versionados en el repo (solo hay scripts SQL sueltos en la raíz). Un cambio de esquema sin el SP correspondiente rompe producción silenciosamente.

---

## 6. GENERACIÓN DE DOCUMENTOS

### 6.1 PDF (backend, `papeletas.routes.js` → `/api/papeletas/:id/pdf`)

- Motor: **PDFKit**, A4/A5 **landscape**, margen 14.
- Diseño: 2 copias ("Copia para Colaborador", "Copia para Vigilancia") dibujadas con `doc.translate/scale`.
- Layout clásico: título "PAPELETA DE PERMISO N°", campos DOI, nombres, cargo, área, motivo, a considerar, fecha emisión, fecha permiso, salida/retorno/tiempo, 3 firmas (Jefe Inmediato, Gestión Humana, Colaborador), logo.
- Sólo imprime si estado = `APROBADO_RRHH` (403 en otro caso).
- Control de papel por query `?paper=A4|A5`.

### 6.2 Reporte triplicado (frontend legacy, `reporte.html`)

- Motor: **html2pdf.js** (cliente) → genera 3 copias (COLABORADOR, VIGILANCIA, RECURSOS HUMANOS).
- Datos vía `PapeletaPermisoAPI.obtenerReporte(id)`.
- Inconsistencia: el triplicado legacy NO incluye logo, y su layout difiere del PDF del backend.

### 6.3 Excel (backend, `exportar-excel`)

- ExcelJS con plantilla opcional `PAPELETA DE PERMISO FORMATO.xlsx` (busca en env `EXCEL_TEMPLATE_PATH`, `backend/templates`, `../templates`).
- Si no hay plantilla: crea hoja "Reporte" con 20 columnas.
- Doble barrera mes/año (SQL + filtro en memoria).
- Formato de hora forzado a texto (`numFmt='@'`) para evitar 01/01/1970.

### 6.4 Problemas de documentos

| # | Riesgo | Detalle |
|---|---|---|
| P1 | **Dos sistemas de PDF distintos** | Backend (PDFKit) vs reporte.html (html2pdf). Resultados visualmente distintos para el mismo documento. |
| P2 | **Texto truncado** | `drawField` usa `fitSingleLine` con `...`; motivos largos se cortan (no hay envoltura multilínea). |
| P3 | **Datos sensibles en el PDF** | No se validan longitudes: un campo muy largo puede invadir cajas/firmas. |
| P4 | **Sin caché de plantillas** | La plantilla Excel se relee del disco en cada exportación. |
| P5 | **Fechas por zona horaria** | El código ya mitiga con UTC para FechaPermisoPP; pero `fechaEmision` usa hora local del servidor (puede desfasarse respecto al negocio). |
| P6 | **`html2pdf.js` en cliente** | Depende de las fuentes/rendering del navegador; resultado no determinista entre máquinas. |

---

## 7. MÓDULO DE IMPRESIÓN

### 7.1 Flujo actual

```
permisos.controller.js generarPDF(id)
  → valida estado APROBADO_RRHH (frontend)
  → pregunta tamaño A4/A5 (SweetAlert)
  → fetch /api/papeletas/:id/pdf?paper=...
  → blob → iframe en overlay "Vista Previa PDF"
  → usuario imprime desde el visor del navegador

reporte.html (legacy, triplicado)
  → html2pdf().set(...).from(#area-pdf).save()
  → genera PDF client-side
```

### 7.2 Problemas

- Los saltos de página están hardcodeados (`sectionH = 184`, `sectionGap = 10`, 2 copias). Agregar una 3ª copia o ajustar márgenes de papel requiere recalcular coordenadas a mano.
- No hay capa de "plantilla" configurable; los textos ("V°B° Jefe Inmediato", "Grupo Pecuario S.A.C.") están incrustados.
- Soporte 200+ trabajadores: OK porque el PDF se genera por papeleta (1 a la vez), pero no hay prueba de volumen ni de carga concurrente.

---

## 8. PUNTOS CRÍTICOS DE PRODUCCIÓN

### 8.1 Checklist de criticidad

| # | Punto | Crítico | Detalle |
|---|---|---|---|
| C1 | **Concurrencia de numeración** | ALTO | `insertar` usa transacción SERIALIZABLE + `SELECT MAX(NumeroPP)+1` con UPDLOCK/HOLDLOCK. **Correcto** pero frágil si crece el volumen (escala de bloqueos). Alternativa recomendada: SEQUENCE/IDENTITY. |
| C2 | **Cruce de horarios** | ALTO | Chequeo dentro de la misma transacción SERIALIZABLE. Bien implementado. |
| C3 | **Pool de conexiones** | MEDIO | Un pool global `mssql` compartido por todos los módulos. Sin límite explícito de pool (`pool.max` no configurado). En picos puede agotar conexiones. |
| C4 | **Fallback de login** | ALTO | La cadena local → SP → ERP se rompe si el SP heredado cambia contrato. |
| C5 | **Scripts SQL no versionados** | ALTO | SPs críticos no están en el repo → no se puede reproducir el entorno. |
| C6 | **CDN externo en producción** | MEDIO | SweetAlert2/Chart.js/html2pdf por CDN. Sin offline. |
| C7 | **Código muerto en producción** | MEDIO | `reportes.api.js` usa `apiClient` inexistente; varios controllers/servicios no se cargan. Confusión y mantenimiento costoso. |
| C8 | **Doble definición `PermisosController`** | MEDIO | En `permisos.controller.js` (activo) y `papeletas.controller.js` (muerto). |
| C9 | **Encoding roto** | BAJO | Strings con `�` / `?rea` / `a?n` en mensajes. |
| C10 | **PM2 en devDependencies** | BAJO | Incorrecto; PM2 debe ser dependency de runtime. |
| C11 | **JWT sin revocación** | MEDIO | Token válido 12h sin blacklist; la desactivación de un usuario ERP no invalida tokens emitidos. |
| C12 | **.env con credenciales reales** | ALTO | En disco local con credenciales de BD reales. NO está en git (verificado: solo `.env.example` en repo). Riesgo si se comparte la máquina o se sube por error. |

---

## 9. PROBLEMAS ENCONTRADOS (resumen ejecutivo)

### 9.1 Código duplicado

| Pieza | Dónde |
|---|---|
| `normalizeRole` | middlewares/auth.js, papeletas.routes.js, usuarios.routes.js, frontend guards |
| Mapeo `sw_nivel → rol` | auth.routes.js, papeletas.routes.js, usuarios.routes.js |
| `isPrivilegedRole` / set de roles ADMIN+RRHH | papeletas.routes.js, middlewares (authorizeRoles) |
| Formateadores (`formatearFechaCorta`, `formatearHoraCorta`, `obtenerIniciales`) | utils/formatters.js y permisos.api.js (legacy) |
| `class PermisosController` | permisos.controller.js (activo) y papeletas.controller.js (muerto) |
| Lógica de filtros por área/creador en `listar` vs `exportar-excel` | papeletas.routes.js (~80 líneas repetidas) |
| `ensureErpAuditTable` | auth.routes.js y usuarios.routes.js |

### 9.2 Archivos demasiado grandes

| Archivo | Líneas | Problema |
|---|---|---|
| backend/routes/papeletas.routes.js | 1835 | Rutas + validación + negocio + SQL + Excel + PDF mezclados |
| js/api/permisos.api.js | 1020 | Legacy; nunca cargado en las páginas modernas |
| js/controllers/permisos.controller.js | 999 | Hace de controller+view+pdf+export |
| js/controllers/formulario-papeleta.controller.js | 213 | Coordinador puro (refactorizado a utils/services/views/pages) |
| js/views/dashboard.view.js | 888 | Render + charts |
| backend/routes/usuarios.routes.js | 605 | Rutas+admin+ERP |
| js/controllers/administrar.controller.js | — | Eliminado (era panel ERP legacy sin HTML que lo cargara) |

### 9.3 Dependencias obsoletas / riesgos

- `pm2` en `devDependencies` (runtime).
- CDN externos sin fallback (SweetAlert2, Chart.js, html2pdf, FontAwesome).
- Sin `.nvmrc` / engines fijos en package.json (Node 24 en dev; producción puede diferir).
- Sin test runner (script `test` = `echo "no test specified"`).

### 9.4 Posibles errores / bugs detectados

1. `js/api/reportes.api.js` referencia `apiClient` que **no existe** en el proyecto (rotura garantizada si alguien lo carga).
2. `HTML/reporte.html` carga `permisos.api.js` cuyo `DOMContentLoaded` llama `HealthAPI.check()` (health.api.js no cargado ahí) → ReferenceError + TypeError al escribir en `#tabla-body` inexistente en consola.
3. Orden de scripts en `reporte.html`: legacy se carga antes que `api-client.js` y `papeletas.api.js`.
4. `papeletas.api.js` `insertar/editar` llama `obtenerNombrePC()` (definido en api-client.js): si se carga `papeletas.api.js` sin api-client.js → ReferenceError (hoy todas las páginas cargan ambos).
5. `formulario-papeleta.html` carga `papeletas.service.js` (que define `PermisosService`) pero el controller usa `PapeletasAPI`; el service sobra.
6. `HTML/dashboard.html:42` `aria-label="Cerrar men?"` (encoding roto).
7. `isClosedPapeleta` incluye `APROBADO_JEFE` como cerrada, pero el flujo de negocio parece gestionar solo `APROBADO_RRHH`/`RECHAZADO` — inconsistencia semántica a revisar sin cambiar comportamiento.
8. `exportar-excel`: si no hay plantilla, `templateStyles` se calcula sobre fila 2 de una hoja nueva (vacíos) — sin impacto, pero inútil.
9. En `insertar`, `idUsuarioCreador` para usuarios ERP queda null (solo se resuelve desde TBL_USUARIOS); el filtrado por creador no aplica a usuarios ERP sin acceso por área.
10. `reporte.html` usa `window.open(blobURL)` en `generarPDF` legacy; pop-up puede ser bloqueado.

### 9.5 Mejoras recomendadas (alto nivel)

1. Separar responsabilidades del backend en `src/` (routes/controllers/services/repositories/validators/security/utils).
2. Centralizar la autorización en políticas (FASE 3).
3. Un único motor de PDF (backend) con plantilla vectorial profesional (FASE 4).
4. Eliminar código muerto y duplicar los módulos frontend únicos (FASE 5).
5. Adoptar pruebas automatizadas + smoke tests (FASE 6).
6. Versionar SPs y scripts SQL (D1, C5).
7. Configurar pool con límites (`pool.max`, `pool.min`).
8. Agregar rate-limit en login y, si es posible, revocación de token por usuario desactivado.
9. Proveer fuentes locales en vez de CDN (o al menos fallback).
10. Revisar el algoritmo de verificación de contraseña ERP (A1) sin cambiar el mecanismo: documentar y testear los formatos soportados.

---

## 10. MATRIZ DE RIESGOS

| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|---|
| R1 | Login ERP se rompe por cambio de formato de contraseña | Alto | Media | Tests de contrato contra fixtures; documentar formatos |
| R2 | Pérdida de conexión SQL en pico | Alto | Baja | Pool con límites + health checks + retry |
| R3 | Numeración duplicada bajo alta concurrencia | Alto | Baja | Mantener SERIALIZABLE; evaluar SEQUENCE en fases posteriores |
| R4 | SP desactualizado vs esquema | Alto | Media | Versionar SPs en repo + migraciones |
| R5 | Rotura por carga de módulo legacy | Medio | Media | Eliminar/aislar código muerto (FASE 5) |
| R6 | CDN caído en producción | Medio | Baja | Descargar librerías al repo |
| R7 | Token válido tras desactivar usuario | Medio | Media | Revocación/blacklist corta (mejora opcional) |
| R8 | Fuga de credenciales locales | Alto | Baja | Mantener `.env` fuera de git (ya OK), rotar si se sospecha |

---

## 11. CONCLUSIÓN FASE 1

El sistema es **funcional y está bien concebido** en varios puntos críticos (transacción SERIALIZABLE para numeración, chequeo de cruce de horarios, auditoría completa, doble barrera en exportación, compatibilidad de subpath `/SistemasPapeletas`). El problema no es funcional sino **estructural**:

- Rutas gigantes que mezclan transporte, validación, negocio, acceso a datos y generación de documentos.
- Autorización dispersa y duplicación de reglas.
- Dos generaciones de frontend y dos motores de PDF.
- Código muerto que confunde el mantenimiento.
- Ausencia total de pruebas automatizadas.
- SQL/SPs no versionados.

La refactorización propuesta (FASE 2 en adelante) preservará **exactamente** el contrato público (endpoints, payloads, páginas) y solo reorganizará el código internamente, añadiendo capas de seguridad explícitas, un módulo de documentos unificado y pruebas.

*Fin del documento de análisis. No se realizó ningún cambio de código.*
