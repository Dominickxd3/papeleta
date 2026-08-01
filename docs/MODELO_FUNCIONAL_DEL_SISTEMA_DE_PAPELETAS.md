# MODELO FUNCIONAL DEL SISTEMA DE PAPELETAS

> Fotografía exacta del comportamiento **actual** del sistema en producción.
> Fuente: código real de `backend/` (rutas, servicios, middlewares), scripts SQL en git y frontend (`js/views/`).
> Fecha de análisis: 2026-07-31. No se modificó código para elaborar este documento.

---

## 1. OBJETIVO DEL SISTEMA

**Para qué existe:** Gestionar el ciclo de vida de las "papeletas de permiso" (permisos de salida/ausencia del personal) de Grupo Pecuario: registro, aprobación por Recursos Humanos, impresión del documento físico oficial y consulta estadística.

**Problema empresarial que resuelve:** Reemplaza la emisión y control manual (papel) de permisos de salida por un flujo digital con trazabilidad total: quién registró, quién modificó, quién aprobó, desde qué IP y navegador, en qué fecha.

**Proceso que digitaliza:** El flujo que antes era un documento físico firmado a mano (V°B° Jefe Inmediato, V°B° Gestión Humana, firma del colaborador) con dos copias ("Copia para Colaborador", "Copia para Vigilancia"), ahora se genera como PDF imprimible con la misma estructura.

**Usuarios involucrados:**
- **Trabajador / Colaborador** (autenticado por ERP o cuenta local): registra y consulta sus papeletas.
- **Jefe Inmediato**: en el modelo actual NO existe un rol "JEFE" separado en el backend. El **creador** de la papeleta se trata como jefe inmediato (su nombre aparece en la firma del PDF). Ver sección 13 (Reglas no confirmadas).
- **RRHH**: aprueba/rechaza, restaura, consulta auditoría, sincroniza trabajadores, visualiza todo.
- **Administrador**: mismo poder que RRHH más la gestión de usuarios ERP (roles/niveles/bloqueos).

---

## 2. ACTORES DEL SISTEMA

Los roles se derivan del código. La normalización usada en backend (`normalizeRole`) elimina tildes, símbolos y espacios múltiples, y pasa a mayúsculas. Los roles efectivos son:

| Rol app | Formas que se aceptan | Nivel ERP (sw_nivel) |
|---|---|---|
| `USUARIO` | — | 1 (default) |
| `RRHH` | `RRHH`, `RR HH`, `RECURSOS HUMANOS` | 3 |
| `ADMIN` | `ADMIN`, `ADMINISTRADOR`, `ADMINISTRADOR DEL SISTEMA` | 4 |
| `SUPERADMIN` | (solo en gestión ERP, mapea a sw_nivel 5; no aparece en listas de autorización del backend) | 5 |

**No existe rol "JEFE"** en ninguna lista de autorización del backend.

### 2.1 Usuario ERP trabajador (`USUARIO`, sw_nivel 1)
- **Autenticación:** login contra ERP (`vw_ERP_Usuarios` + `sp_login_usuario`) o cuenta local (`TBL_USUARIOS`).
- **De dónde obtiene sus permisos:** del JWT emitido en login (`rol`, `sw_nivel`, `origen`) y, si es usuario ERP nivel 2, de las tablas de áreas (`TBL_USUARIO_ERP_AREA_APP` / `TBL_AREAS_ERP_APP`).
- **Información que ve:** solo sus propias papeletas (filtro por `IdUsuarioCreador`, o por `DOIPP`, o por auditoría de creación con su login/nombre).
- **Puede:**
  - Crear papeletas (`POST /api/papeletas/insertar`).
  - Ver/consultar sus papeletas (`GET /api/papeletas/listar`, `/mostrar`, historial).
  - Editar papeletas **abiertas** (no aprobadas/rechazadas/anuladas).
  - Eliminar (anular) papeletas (`DELETE /api/papeletas/eliminar`).
  - Descargar/imprimir PDF de papeletas con estado `APROBADO_RRHH`.
  - Exportar Excel (filtrado a su alcance).
  - Consultar sus notificaciones y marcarlas leídas.
  - Editar su perfil (solo si tiene `id` > 0, es decir cuenta local) y cambiar su contraseña local.
- **No puede:**
  - Aprobar/rechazar (`403` por `requireAprobacionRole`).
  - Restaurar papeletas (`403`).
  - Editar papeletas cerradas (aprobadas/rechazadas/anuladas) — `403` "No se puede editar una papeleta aprobada, rechazada o anulada.".
  - Consultar auditoría (`403`).
  - Sincronizar trabajadores (`403`).
  - Gestionar usuarios ERP (`403`).

### 2.2 Usuario ERP con acceso por área (sw_nivel 2)
- Mismo perfil que USUARIO, pero con visibilidad extendida: ve las papeletas de **todas las áreas que tenga asignadas** en `TBL_USUARIO_ERP_AREA_APP`.
- Se le aplica la política de áreas en lugar del filtro por creador.
- Si no tiene áreas asignadas, **no ve ninguna papeleta** (`1 = 0`).
- No aprueba (sw_nivel 2 < 3 → no privilegiado).

### 2.3 RRHH
- **Autenticación:** igual que los demás (ERP o local). Se distingue por `rol` = RRHH o `sw_nivel` = 3.
- **De dónde obtiene sus permisos:** token JWT (`rol`) o `sw_nivel` (re-evaluado con `effectiveSwNivel >= 3` en listar/exportar).
- **Información que ve:** TODAS las papeletas (sin filtro de creador ni área).
- **Puede:** todo lo de USUARIO, más aprobar/rechazar (`APROBADO_RRHH`/`RECHAZADO`), restaurar, consultar auditoría, sincronizar cache de trabajadores, editar papeletas cerradas.
- **No puede:** gestionar usuarios ERP (solo ADMIN/`canManageUsers`).

### 2.4 Administrador
- Mismo poder que RRHH más:
  - Listar roles ERP (`/api/usuarios-erp/roles`).
  - Buscar usuarios ERP (`/api/usuarios-erp/buscar`).
  - Panel de administración ERP (`/api/usuarios-erp/panel`).
  - Asignar roles (`USUARIO|RRHH|ADMIN|SUPERADMIN`) (`PUT /api/usuarios-erp/roles/:userLogon`).
  - Bloquear/desbloquear cuentas, registrar reset de contraseña (`POST /api/usuarios-erp/acciones/:userLogon`).
  - Ver historial de auditoría ERP de un usuario.
- Nota: el backend autoriza estas acciones solo si `normalizeRole(user.rol)` ∈ {`ADMIN`, `ADMINISTRADOR`, `ADMINISTRADOR DEL SISTEMA`}. Un usuario con `sw_nivel >= 4` pero rol app no-ADMIN NO puede (la política `canManageUsers` solo mira el rol del token).

---

## 3. AUTENTICACIÓN

Flujo real extraído de `routes/auth.routes.js`:

```
usuario + contraseña
      ↓
[1] ¿Cuenta local con hash pbkdf2 en TBL_USUARIOS (Activo='1')?
      ├─ SÍ → [1a] ¿Bloqueado = '1'? → 403 "Usuario bloqueado"
      │         [1b] verifyPassword(pbkdf2$...) → ¿OK? → LOGIN_OK (origen LOCAL)
      │              → NO → 401 "Credenciales inválidas"
      └─ NO → [2] EXEC sp_login_usuario (@Usuario, @Contrasena)
                ├─ Success=1 → LOGIN_OK (origen LOCAL/SP)
                └─ Success<>1 → [3] Consulta vw_ERP_Usuarios por User_Logon
                                ├─ ¿Usuario ERP inactivo? → 403 "Usuario inactivo"
                                ├─ matchesErpPassword(5 codificaciones) → ¿OK?
                                │    → [4] resolveErpAccess(UserLogon)
                                │         ├─ Activo en TBL_USUARIOS_ERP_APP ≠ '1' → 403 "Usuario sin acceso al sistema de papeletas"
                                │         └─ OK → LOGIN_OK (origen ERP)
                                └─ NO coincide → 401 "Credenciales inválidas"
      ↓
Emisión de JWT (HS256, 12h) con payload { id, usuario, nombre, email, rol, sw_nivel, origen, ultimoAcceso }
```

**Fuente que valida la identidad:**
1. Cuenta local: `TBL_USUARIOS` con hash PBKDF2 (formato `pbkdf2$iteraciones$salt$hash`, SHA-512, 64 bytes, 120000 iteraciones). `verifyPassword` usa `timingSafeEqual`.
2. SP `sp_login_usuario` (legacy).
3. ERP: vista `vw_ERP_Usuarios`. La contraseña se compara contra `User_PassBin`/`UserPassText` probando 5 codificaciones: `utf8`, `utf16le`, `latin1`, `hex`, `base64` (función `matchesErpPassword`).

**Diferencia usuario ERP vs usuario local:**
- **Local:** tiene fila en `TBL_USUARIOS` con `IdUsuario`, `Rol` propio, puede editar perfil y cambiar contraseña. `origen = 'LOCAL'`.
- **ERP:** NO tiene `IdUsuario` (se usa `IdUsuario = 0`), su rol proviene de `sw_nivel` (tabla `TBL_USUARIOS_ERP_APP` o legacy `TBL_ROLES_USUARIO_ERP`). `origen = 'ERP'`. Su perfil no es editable desde el módulo (403).

**Cómo se determina el rol** (`roleFromSwNivel`):
- `sw_nivel >= 4` → `ADMIN`
- `sw_nivel == 3` → `RRHH`
- resto → `USUARIO`

**Cómo se determina el nivel:** campo `sw_nivel` del usuario ERP (`TBL_USUARIO_ERP_APP.sw_nivel`, default 1). Para cuentas locales sin sw_nivel, se usa `0`.

**Cómo se determinan las áreas permitidas** (`getErpAreaAccess`):
- Solo aplica a usuario ERP con `sw_nivel = 2` y `Activo = '1'`.
- Consulta `TBL_USUARIO_ERP_AREA_APP` → `TBL_AREAS_ERP_APP`, devuelve lista de `NombreAreaERP` (solo filas activas).
- Cualquier otro caso → `{ swNivel, areas: [] }` (sin restricción de área).

**Autorización por middleware:** después del login, todas las rutas `/api/*` exigen `Authorization: Bearer <token>` (excepto `/`, `/auth/login`, `/health`). El token se valida (firma HS256, issuer `papeletas-gp`, audience `papeletas-gp-web`, expiración 12h) y se inyecta `req.user`.

---

## 4. MODELO DE PERMISOS

Basado en los guards reales: `requireAprobacionRole` (roles privilegiados ADMIN/RRHH), `requireTrabajadoresRole` (idéntico), política `canManageUsers` (solo ADMIN) y políticas `canEditPapeleta` / `canDownloadDocument`.

> Nota: en backend no existe la acción "Aprobar" para un rol Jefe. La única aprobación gestionada es la de RRHH. El backend **no** valida quién edita una papeleta abierta (cualquier usuario autenticado puede), ni impide que un usuario apruebe su propia papeleta (no hay regla "no auto-aprobación"). Ver sección 13.

| Acción | USUARIO (sw 1) | ERP nivel 2 | RRHH | ADMIN |
|---|---|---|---|---|
| Crear papeleta | ✅ | ✅ | ✅ | ✅ |
| Ver papeletas | Solo las suyas | Solo sus áreas | Todas | Todas |
| Editar papeleta abierta | ✅ | ✅ | ✅ | ✅ |
| Editar papeleta cerrada (aprob/rechaz/anulada) | ❌ 403 | ❌ 403 | ✅ | ✅ |
| Eliminar (anular) | ✅ | ✅ | ✅ | ✅ |
| Aprobar (`APROBADO_RRHH`) | ❌ 403 | ❌ 403 | ✅ | ✅ |
| Rechazar (`RECHAZADO`) | ❌ 403 | ❌ 403 | ✅ | ✅ |
| Restaurar | ❌ 403 | ❌ 403 | ✅ | ✅ |
| Descargar PDF (si `APROBADO_RRHH`) | ✅ | ✅ | ✅ | ✅ |
| Imprimir (PDF en navegador) | ✅ | ✅ | ✅ | ✅ |
| Exportar Excel | ✅ (solo su alcance) | ✅ (solo su alcance) | ✅ (todo) | ✅ (todo) |
| Administrar usuarios ERP | ❌ 403 | ❌ 403 | ❌ 403 | ✅ |
| Consultar auditoría | ❌ 403 | ❌ 403 | ✅ | ✅ |
| Sincronizar trabajadores | ❌ 403 | ❌ 403 | ✅ | ✅ |
| Editar perfil / cambiar contraseña | ✅ (solo cuenta local) | ❌ (ERP) | ✅/❌ | ✅/❌ |

**Implementación técnica de permisos:**
- Middleware de rutas: `requireAprobacionRole` (server.js) aplicado a: auditoría, usuarios listar, usuarios-erp (roles/buscar/panel/historial/acciones), papeletas `gestionar` y `restaurar`, trabajadores insertar/editar/eliminar/sync.
- Política `canEditPapeleta(user, papeleta)`: cerrada = `ActivoPP='2'` OR estado ∈ {`APROBADO_RRHH`, `APROBADO_JEFE`, `RECHAZADO`}. Si cerrada y no privilegiado → 403.
- Política `canDownloadDocument(user, papeleta)`: requiere estado = `APROBADO_RRHH` → sino 403.
- Política `canManageUsers(user)`: solo ADMIN → 403.
- En listar/exportar, el privilegio se re-evalúa con `isPrivilegedRole(rol) || effectiveSwNivel >= 3` (por si el token trae sw_nivel pero rol distinto).

---

## 5. FLUJO DE VIDA DE UNA PAPELETA

**Estados posibles del campo `EstadoAprobacion`** (default `PENDIENTE`): `PENDIENTE`, `APROBADO_JEFE`, `APROBADO_RRHH`, `RECHAZADO`.
**Flag adicional `ActivoPP`:** `'1'` activa, `'2'` anulada/inactiva. (El label del frontend muestra "Rechazado" si `ActivoPP='2'` o si estado = `RECHAZADO`.)

Diagrama real (según endpoints y SQL):

```
                ┌──────────────────────────────────────────────┐
                │ POST /api/papeletas/insertar                 │
                │  - valida cruce horario (mismo DOI+fecha)     │
                │  - numera MAX(NumeroPP)+1 (SERIALIZABLE)      │
                │  - ejecuta insertar_PapeletaPermiso_gp        │
                │  - auditoría CREAR + notificación a RRHH      │
                └──────────────────┬───────────────────────────┘
                                   ↓
                          EstadoAprobacion = PENDIENTE
                                   ↓
              ┌────────────────────┼────────────────────┐
              ↓                    ↓                    ↓
        [editar]            [gestionar]           [eliminar]
    solo si NO cerrada     SOLO RRHH/ADMIN       (cualquier
              │            APROBADO_RRHH  RECHAZADO  autenticado)
              ↓                    ↓            ↓          ↓
      sigue PENDIENTE        APROBADO_RRHH  RECHAZADO   ActivoPP='2'
        (auditoría             ↓           (RazonRechazo  + RECHAZADO
         EDITAR)         [PDF/impresión]    + notificación ("Anulada desde
                             ↓              al creador)    el sistema")
                      DOCUMENTO OFICIAL                     ↓
                    (reporte_PapeletaPermiso_gp)       [restaurar]
                                                       SOLO RRHH/ADMIN
                                                       → PENDIENTE, ActivoPP='1'
```

**Quién cambia cada estado:**
- `PENDIENTE` → creado por el propio usuario (siempre empieza ahí).
- `PENDIENTE` → `APROBADO_RRHH` / `RECHAZADO`: SOLO por `POST /api/papeletas/gestionar` (guard `requireAprobacionRole`). Escribe `AprobadoPorRRHH`, `FechaAprobacionRRHH`, `RazonRechazo`, y concatena " | Nota RRHH: ..." en ObservacionesPP.
- `ActivoPP 1→2` (anulación): por `DELETE /api/papeletas/eliminar` (cualquier autenticado) que además fuerza estado `RECHAZADO`. La anulación definitiva la hace el SP `eliminar_PapeletaPermiso_gp` + UPDATE.
- `ActivoPP 2→1` y `RECHAZADO→PENDIENTE` (restauración): `PATCH /api/papeletas/restaurar` (solo RRHH/ADMIN). Limpia `AprobadoPorRRHH`, `FechaAprobacionRRHH`, `RazonRechazo`.
- **`APROBADO_JEFE` NO se escribe en ningún endpoint.** Solo existe como valor posible en filtros (`estado=aprobadas` lo incluye) y en el label "Aprobado por Jefe". El código del backend no contiene ninguna instrucción que lo asigne.

**Condiciones para avanzar:**
- Crear: no debe existir cruce de horario con otra papeleta activa del mismo trabajador en la misma fecha (rangos que se solapan: `nuevo.start < existente.end && nuevo.end > existente.start`). Hora de salida obligatoria.
- Aprobar/rechazar: solo estados válidos `APROBADO_RRHH` o `RECHAZADO` (si otro → 400).
- PDF: exige estado `APROBADO_RRHH`.

**Acciones que quedan bloqueadas:**
- Editar papeleta cerrada (no privilegiado) → 403.
- Generar PDF con estado ≠ `APROBADO_RRHH` → 403.

---

## 6. REGLAS DE EDICIÓN

Extraídas de `PUT /api/papeletas/editar` + política `canEditPapeleta`:

- **Cuándo se puede modificar:** la papeleta no debe estar "cerrada", es decir `ActivoPP != '2'` y estado ∉ {`APROBADO_RRHH`, `APROBADO_JEFE`, `RECHAZADO`}.
- **Excepción:** si el usuario es privilegiado (ADMIN/RRHH) puede editar aunque esté cerrada.
- **Quién puede modificarla:** cualquier usuario autenticado para papeletas abiertas (el backend NO valida que sea el creador). Privilegiados además las cerradas.
- **Campos modificables (los que se escriben):** `FechaModificacionPP`, `PcModificacionPP`, `FechaPermisoPP`, `NumeroPP`, `DOIPP`, `TrabajadorPP`, `CargoPP`, `AreaPP`, `MotivoPP`, `ConsiderarPP`, `HSalidaPP`, `HRetornoPP`, `TiempoPP`, `ObservacionesPP`, `ActivoPP`, y opcionalmente `FechaVacDesdePP`/`FechaVacHastaPP` (rango de vacaciones).
- **Validaciones previas:** la papeleta existe (sino 404), hora de salida obligatoria (400), sin cruce horario con otra papeleta del mismo trabajador/fecha excluyendo la propia (sino 409).
- **Estados que bloquean cambios:** `APROBADO_RRHH`, `APROBADO_JEFE`, `RECHAZADO`, y `ActivoPP='2'` (para no privilegiados).
- **Auditoría:** registra `EDITAR` con `datosAnteriores` y `datosNuevos` (row completa).

---

## 7. REGLAS DE APROBACIÓN

- **Quién aprueba:** solo usuarios con rol privilegiado (ADMIN/RRHH) — guard `requireAprobacionRole` sobre `POST /api/papeletas/gestionar`.
- **Primero / después:** el flujo de aprobación del backend es de **un solo nivel de aprobación (RRHH)**. El estado `APROBADO_JEFE` existe en el modelo de datos pero **ningún endpoint lo asigna**; la firma "V°B° Jefe Inmediato" del PDF se cubre con el nombre del **creador de la papeleta** (jefe que registró en nombre del colaborador).
- **Aprobar:** cuerpo `{ IdPP, nuevoEstado: 'APROBADO_RRHH', observacionesAdmin? }`. Escribe estado, `AprobadoPorRRHH = usuario`, `FechaAprobacionRRHH = GETDATE()`, y concatena nota en `ObservacionesPP`. Auditoría `APROBAR_RRHH`. Notifica al creador ("Tu papeleta fue aprobada").
- **Rechazar:** `nuevoEstado: 'RECHAZADO'`. Guarda `RazonRechazo = observacionesAdmin` (si vacío → NULL), concatena "Nota RRHH" en observaciones. Auditoría `RECHAZAR_RRHH`. Notifica al creador ("Tu papeleta fue rechazada").
- **Estados válidos:** solo `APROBADO_RRHH` o `RECHAZADO`; cualquier otro → 400 "Estado de aprobación no valido".
- **Si restauran:** `PATCH /api/papeletas/restaurar` vuelve a `PENDIENTE` con `ActivoPP='1'`, borra `AprobadoPorRRHH`, `FechaAprobacionRRHH`, `RazonRechazo`. Auditoría `RESTAURAR`. Solo RRHH/ADMIN.
- **Notificaciones al crear:** se notifica a TODOS los usuarios con `Rol='RRHH'` y `Activo='1'` de `TBL_USUARIOS` ("Nueva papeleta pendiente").

---

## 8. REGLAS DE VISIBILIDAD

Extraídas de `GET /api/papeletas/listar` (misma lógica en `exportar-excel`). El privilegio se recalcula en cada petición: `privileged = isPrivilegedRole(userRole) || effectiveSwNivel >= 3`.

- **Privilegiado (RRHH/ADMIN o sw_nivel ≥ 3):** sin restricción de filas. Ve todas las papeletas de todos.
- **Usuario ERP con sw_nivel = 2:** ve SOLO papeletas cuya `AreaPP` (normalizada con `LTRIM/RTRIM`) coincida con alguna de sus áreas ERP. Si no tiene áreas → `1 = 0` (no ve nada). Esto aplica tanto en listar como en exportar Excel.
- **No privilegiado (resto):** ve solo lo suyo, mediante **una de estas tres condiciones** (OR):
  1. `IdUsuarioCreador = id` del token (si existe la columna y el usuario tiene id > 0), o
  2. `DOIPP = doi` del token, o
  3. `TrabajadorPP LIKE '%nombre%'` del usuario, o
  4. Existencia de auditoría `CREAR` sobre la papeleta con `Usuario` o `NombreUsuario` = login del token (fallback cuando no hay `id`).
- **Filtros adicionales de consulta:** `area`, `texto` (Trabajador/DOI/Cargo/Área/Motivo/Considerar/Número), `estado` (`pendientes`/`aprobadas`/`rechazadas`), `mostrarAnulados`, paginación (`page`/`pageSize`, máx 100).
- **Frontend:** el tablero usa `esRolPrivilegiado(rol) = rol === 'ADMIN' || rol === 'RRHH'`; la vista de permisos muestra botón editar habilitado si es privilegiado o la papeleta no está cerrada; botón PDF habilitado solo con aprobación RRHH; botón restaurar solo si anulada y usuario privilegiado.

---

## 9. DOCUMENTO PDF / IMPRESIÓN

Extraído de `GET /api/papeletas/:id/pdf` y `GET /api/papeletas/reporte/:id`:

- **Cuándo se genera:** solo cuando la papeleta tiene estado `APROBADO_RRHH` (403 en caso contrario).
- **Quién puede generarlo:** cualquier usuario autenticado (no hay restricción de rol en el backend para el PDF, siempre que el estado sea `APROBADO_RRHH`).
- **Estado necesario:** `APROBADO_RRHH`.
- **Fuente de datos:** SP `reporte_PapeletaPermiso_gp` + columnas opcionales `FechaVacDesdePP`/`FechaVacHastaPP` (si existen) + nombre del creador (para la firma del jefe) con fallback a la auditoría `CREAR`.
- **Formato actual:** generado con **PDFKit**. Título "PAPELETA DE PERMISO N° ####" (padded a 4 dígitos). Campos: DOI, Nombres y Apellidos, Cargo, Área, Motivo, A considerar, Fecha Emisión, Fecha Permiso, Salida/Retorno/Tiempo (en cajas). `A considerar` se normaliza: rangos de vacaciones → "Vacaciones N dias"; "1/2 dia a cuenta de vacaciones", "Vacaciones", "Compensacion".
- **Tamaño papel:** `A4` por defecto o `A5` vía query `?paper=A5`. **Orientación:** landscape (horizontal). Margen 14. Header `X-PDF-Paper`.
- **Copias existentes:** el PDF dibuja **2 copias idénticas** en la misma hoja: etiquetas `['Copia para Colaborador', 'Copia para Vigilancia']`. Cada copia se escala para caber (`scale = min(availableW/baseW, availableH/baseTotalH)`).
- **Firmas (por copia):** tres líneas de firma: `V°B° Jefe Inmediato` (con el nombre del creador sobre la línea), `V°B° Gestion Humana`, `Colaborador`. Se dibuja el logo `img/logo-gp.png` si existe.
- **Distribución física:** el PDF se envía en línea (`Content-Disposition: inline; filename="Papeleta_<numero>.pdf"`), para imprimir desde el navegador. El frontend además usa html2pdf.js para generar el documento (2 generaciones de PDF en la página legacy).
- **Nombre de firma:** se omite si contiene `\` o `@`, o si no tiene espacio (para evitar mostrar logins de máquina).
- **Excel (`exportar-excel`):** filtra por mes/año (obligatorios, 400 si inválidos), usa plantilla `templates/PAPELETA DE PERMISO FORMATO.xlsx` (hoja `Hoja2` o primera) si existe; si no, crea hoja `Reporte` con 20 columnas (ITEM, ID_PP, fechas, usuarios, número, DOI, trabajador, cargo, área, motivo, considerar, horas, observaciones, activo). Segunda barrera en memoria: re-filtra fecha/año/mes/activo/estado/área/texto. Encabezados forzados y `fmtUser` oculta valores tipo `PC_*`.

---

## 10. BASE DE DATOS

> Esquema extraído de scripts SQL del repositorio (git) y de las consultas del código. Los scripts `backend/sql/*.sql` están eliminados del working tree actual pero existen en `HEAD`.

### 10.1 Entidades principales

| Tabla | Propósito | Relaciones / campos importantes |
|---|---|---|
| `TBL_GGHH_PapeletaPermiso` | Papeletas de permiso (entidad central). | `IdPP` (PK), `NumeroPP` (correlativo), `FechaRegistroPP`, `PcRegistroPP`, `FechaModificacionPP`, `FechaEmisionPP`, `FechaPermisoPP` (DATE), `DOIPP`, `TrabajadorPP`, `CargoPP`, `AreaPP`, `MotivoPP`, `ConsiderarPP`, `HSalidaPP`/`HRetornoPP`/`TiempoPP` (TIME(7)), `ObservacionesPP`, `ActivoPP` ('1'/'2'), `EstadoAprobacion`, `AprobadoPorRRHH`, `FechaAprobacionRRHH`, `RazonRechazo`, `IdUsuarioCreador` (opcional, se detecta por esquema), `FechaVacDesdePP`/`FechaVacHastaPP` (opcionales). Índice único `UX_Papeleta_Trabajador_Fecha_Activa` (mensaje de duplicado). |
| `TBL_TIPOS_PERMISO` | Catálogo de tipos de permiso (activos). | `Activo`, `Orden`. |
| `TBL_ESTADOS_PAPELETA` | Catálogo de estados (para UI). | `Orden`. |
| `TBL_FERIADOS` | Feriados (filtro de fecha). | `Fecha`, `Activo`. |
| `TBL_CONFIGURACION` | Configuración clave/valor por categoría. | `Categoria`, `Clave`. |
| `TBL_HORARIOS` | Horarios de trabajo. | `NombreHorario`, `Activo`. |
| `TBL_GGHH_TrabajadorCache` | Cache de trabajadores sincronizada desde ERP. | `IdTrabajadorERP`, `DOI`, `Trabajador`, `Ocupacion`, `Area`, `Activo`, `FechaSync`. |
| `TBL_USUARIOS` | Usuarios locales (login local + perfil + roles). | `IdUsuario`, `Usuario`, `NombreCompleto`, `Email`, `Rol`, `Contrasena` (hash pbkdf2), `Activo`, `Bloqueado`, `UltimoAcceso`, `FechaCreacion`. |
| `vw_ERP_Usuarios` | Vista (solo lectura) de usuarios del ERP. | `User_Logon`, `User_Fullname`, `User_Email`, `User_Estado`, `User_PassBin`. |
| `TBL_USUARIOS_ERP_APP` | Control de acceso a la app por usuario ERP. | `UserLogon`, `sw_nivel` (1-5), `Activo` ('1'/'2'/'0'), `FechaActualizacion`, `ActualizadoPor`. |
| `TBL_ROLES_USUARIO_ERP` | Mapeo legacy ERP → app. | `UserLogon`, `RolApp`, `sw_nivel`, `Activo`. |
| `TBL_USUARIO_ERP_AREA_APP` | Áreas ERP asignadas a un usuario (nivel 2). | `UserLogon`, `IdAreaERP`, `Activo`. |
| `TBL_AREAS_ERP_APP` | Catálogo de áreas ERP. | `IdAreaERP`, `NombreAreaERP`, `Activo`. |
| `TBL_NOTIFICACIONES` | Notificaciones en app (campana). | `IdNotificacion`, `UsuarioDestino`, `Titulo`, `Mensaje`, `Tipo`, `IdPapeleta`, `Leido`, `FechaCreacion`, `URL`. |
| `TBL_AUDITORIA` | Bitácora de acciones. | `IdAuditoria`, `Tabla`, `IdRegistro`, `Accion`, `Usuario`, `NombreUsuario`, `FechaHora`, `IP`, `Navegador`, `DatosAnteriores`, `DatosNuevos`, `Observaciones`. |
| `TBL_USUARIOS_ERP_AUDITORIA` | Bitácora de acciones sobre usuarios ERP (creada por la app). | `UserLogon`, `TipoEvento`, `Detalle`, `RealizadoPor`, `FechaEvento`. |
| `TBL_ROLES_APP`, `TBL_PERMISOS_APP`, `TBL_ROL_PERMISO_APP`, `TBL_USUARIO_ROL_APP`, `TBL_USUARIO_ERP_ROL_APP` | RBAC de 5 niveles (script `migracion_roles_5_niveles.sql`). **Creadas por migración pero NO son leídas/escritas por el backend actual.** El control real es por `rol`/`sw_nivel`. |

### 10.2 Stored procedures

| SP | Qué hace | Cuándo se usa |
|---|---|---|
| `sp_login_usuario` | Valida credenciales (legacy). | En login (paso 2) y en cambio de contraseña (valida la actual). |
| `insertar_PapeletaPermiso_gp` | Inserta la papeleta. | `POST /api/papeletas/insertar`. |
| `editar_PapeletaPermiso_gp` | Actualiza la papeleta. | `PUT /api/papeletas/editar`. |
| `eliminar_PapeletaPermiso_gp` | Anula la papeleta (ActivoPP='2'). | `DELETE /api/papeletas/eliminar`. |
| `reporte_PapeletaPermiso_gp` | Devuelve el reporte de una papeleta para PDF. | `GET /api/papeletas/reporte/:id` y `/api/papeletas/:id/pdf`. |
| `mostrar_PapeletaPermiso_gp` | Lista todas las papeletas (sin filtro). | `GET /api/papeletas/mostrar`. |
| `sp_SyncTrabajadoresCache` | Sincroniza la cache de trabajadores desde ERP. | `POST /api/trabajadores/sync` (solo privilegiado). |

---

## 11. REGLAS QUE NO SE PUEDEN ROMPER (comprobadas)

1. **Numeración única y secuencial:** `NumeroPP` se calcula como `MAX(NumeroPP)+1` dentro de una transacción con nivel `SERIALIZABLE` y locks `UPDLOCK, HOLDLOCK`, evitando duplicados concurrentes.
2. **No duplicar papeletas activas por trabajador/fecha:** la inserción valida cruce de horario (rangos solapados) y el mensaje de error SQL duplicado `UX_Papeleta_Trabajador_Fecha_Activa` se devuelve como "Ya existe una papeleta activa para este trabajador en la fecha seleccionada.".
3. **Una papeleta aprobada/rechazada/anulada no se puede editar** (salvo RRHH/ADMIN). Mensaje 403 fijo: "No se puede editar una papeleta aprobada, rechazada o anulada.".
4. **PDF solo con estado `APROBADO_RRHH`.** Mensaje 403 fijo: "Solo se puede imprimir una papeleta aprobada por RRHH".
5. **Aprobar/rechazar solo con roles privilegiados** (`requireAprobacionRole`).
6. **Restaurar solo con roles privilegiados.**
7. **Gestión de usuarios ERP solo con rol ADMIN** (política `canManageUsers`).
8. **Sincronización de trabajadores solo privilegiados; altas/ediciones/eliminaciones manuales deshabilitadas** (405 fijo: "Los trabajadores se sincronizan desde ERP (cache).").
9. **Todo cambio registra auditoría:** `CREAR`, `EDITAR`, `ANULAR`, `RESTAURAR`, `APROBAR_RRHH`, `RECHAZAR_RRHH`, `LOGIN_OK`, `LOGIN_FAIL`, `SYNC_TRABAJADORES`. Con IP, navegador, datos anteriores/nuevos.
10. **El rol y el nivel ERP (`sw_nivel`) del usuario se resuelven en cada petición** (`getErpAreaAccess`) para visibilidad; no se confía solo en el token.
11. **Contraseñas locales** con hash PBKDF2 + `timingSafeEqual`; contraseñas ERP comparadas contra binario con 5 codificaciones.
12. **El creador de la papeleta se usa como firma de "Jefe Inmediato"** en el PDF (o el `JefeInmediato` del reporte si existe).
13. **Hora de salida obligatoria** al crear/editar (400 con mensaje fijo "La hora de salida es obligatoria.").
14. **Notificaciones:** al crear → todos los RRHH activos; al aprobar/rechazar → el creador (via `IdUsuarioCreador`).

---

## 12. DIAGRAMA GENERAL

```
ERP (vw_ERP_Usuarios / sp_login_usuario / TBL_USUARIOS)
                        │
                        ▼
        POST /api/auth/login → JWT (rol, sw_nivel, origen)
                        │
                        ▼
        requireAuth (Bearer token) en todas las rutas /api/*
                        │
                        ▼
   Visibilidad: privilegiado (todo) | sw_nivel 2 (áreas) | resto (solo lo suyo)
                        │
                        ▼
   POST /api/papeletas/insertar
      │  (validación cruce horario + numeración serializable)
      ▼
   PENDIENTE ──► [editar/eliminar] ──► auditoría + notificaciones
      │
      ▼
   POST /api/papeletas/gestionar  (SOLO RRHH/ADMIN)
      │
      ├──► RECHAZADO ──► [restaurar] ──► PENDIENTE
      └──► APROBADO_RRHH
                  │
                  ▼
   GET /api/papeletas/:id/pdf  (reporte_PapeletaPermiso_gp + PDFKit)
      │  2 copias: "Colaborador" + "Vigilancia", firmas V°B°
      ▼
   Impresión / archivo físico
      │
      ▼
   TBL_AUDITORIA (traza completa) + notificación al creador
```

---

## 13. REGLAS NO CONFIRMADAS (dudas reales, sin asumir)

1. **Rol "Jefe":** el sistema muestra `APROBADO_JEFE` como estado y "Aprobado por Jefe" como label, y el PDF tiene firma "V°B° Jefe Inmediato", pero **ningún endpoint del backend asigna** `APROBADO_JEFE`. No se puede confirmar si el jefe aprueba por fuera (DB/ERP) o si es un estado residual. Impacto: si existe una bandeja de aprobación de jefe, no está en este backend.
2. **Aprobación de la propia papeleta:** no existe validación "un usuario no puede aprobar su propia papeleta". Un RRHH que creó una papeleta podría aprobarla él mismo vía `/gestionar` (requiere ser privilegiado; no hay check de autoría). No se sabe si el negocio lo permite.
3. **Edición por el creador:** el backend no valida que quien edita una papeleta abierta sea su creador. Cualquier usuario autenticado podría editar la papeleta de otro si conoce el `IdPP`. Puede ser intencional (jefes editan por su personal) o una brecha. No confirmado.
4. **Eliminar por cualquiera:** `DELETE /api/papeletas/eliminar` no exige rol ni autoría; el SP `eliminar_PapeletaPermiso_gp` podría internamente validar autoría, pero el código no lo evidencia. No confirmado.
5. **`eliminar_PapeletaPermiso_gp`:** su lógica interna no está en el repo (solo se invoca). Se asume que pone `ActivoPP='2'`, porque luego el UPDATE del endpoint fuerza estado `RECHAZADO` con "Anulada desde el sistema". No se confirmó el detalle del SP.
6. **`insertar_PapeletaPermiso_gp` / `editar_PapeletaPermiso_gp`:** comportamiento interno no disponible; el endpoint asume que devuelven `IdPP`/`NumeroPP` y que la edición puede mantener número. No confirmado.
7. **`APROBADO_JEFE` en exportar/estadísticas:** se cuenta como "aprobadas" (listar `aprobadas` incluye `APROBADO_JEFE`). No hay forma de que el sistema lo produzca hoy; ver punto 1.
8. **Regla de 1/2 día o a cuenta de vacaciones:** los textos normalizados ("Vacaciones N dias", "1/2 dia a cuenta de vacaciones", "Compensacion") sugieren un catálogo de motivos, pero el backend solo formatea cadenas; no hay validación de catálogo ni de límite de días. El negocio podría requerir validación de saldo/duplicidad que no está en el código.
9. **Restauración de papeletas aprobadas:** el endpoint restaurar lleva cualquier papeleta (incluso `APROBADO_RRHH`) a `PENDIENTE` sin condicionar su estado previo; pierde datos de aprobación. No confirmado si es el comportamiento deseado para aprobadas.
10. **`TBL_ROLES_APP`/RBAC 5 niveles:** la migración SQL crea toda la estructura RBAC, pero el código actual no la consume; el control real usa `Rol`/`sw_nivel`. No confirmado si la migración es obligatoria o si quedó como trabajo pendiente.
11. **Identidad del creador:** el PDF resuelve "jefe inmediato" con varios fallbacks (`IdUsuarioCreador` → auditoría `CREAR` → `JefeInmediato` del reporte). Si ninguno existe, la firma queda en blanco. No confirmado qué fuente es la "correcta" para el negocio.
12. **Contraseña ERP (Fase 1 de reset):** el endpoint `RESET_PASSWORD` solo registra una auditoría ("Fase 1, sin cambio en ERP"); no hay confirmación de que el reset real ocurra en el ERP.

---

*Fin del documento. Sin cambios de código realizados.*
