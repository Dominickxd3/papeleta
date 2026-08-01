# MATRIZ DE DECISIONES DE NEGOCIO — FASE 3.5 (Validación funcional)

> Objetivo: **congelar las reglas de negocio** antes de continuar con FASE 4 (documentos/impresión) y la refactorización.
> Cada fila describe una regla tal como existe HOY en el código, su estado de confirmación, el riesgo de cambiarla y la pregunta que debe responder el dueño del proceso.
> **No se propone solución técnica.** Se espera que cada pregunta sea respondida y registrada antes de seguir.
> Fuente: `docs/MODELO_FUNCIONAL_DEL_SISTEMA_DE_PAPELETAS.md`.

**Leyenda de estado:**
- ✅ **CONFIRMADA** — el comportamiento es inequívoco en el código (no depende de SPs no disponibles).
- ⚠️ **DUDA** — el código no es suficiente para saber la intención del negocio, o depende de lógica externa (SP/ERP) no visible en el repositorio.

---

## A. PRIORIDAD ALTA (reglas solicitadas explícitamente)

### A1. ¿Quién puede editar una papeleta abierta?

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | `PUT /api/papeletas/editar`. Política `canEditPapeleta`: la edición se bloquea SOLO si la papeleta está "cerrada" (`ActivoPP='2'` o estado ∈ {`APROBADO_RRHH`, `APROBADO_JEFE`, `RECHAZADO`}) **y** el usuario no es privilegiado (ADMIN/RRHH). Para papeletas abiertas (`PENDIENTE`), **no existe ninguna validación de autoría**: cualquier usuario autenticado puede editar la papeleta de otro si conoce su `IdPP`. |
| **Estado** | ⚠️ DUDA |
| **Riesgo si se cambia** | **Restringir** (solo creador): puede romper el flujo donde un jefe/secretaria registra y edita papeletas de sus colaboradores. **Mantener abierto**: riesgo de que un usuario altere papeletas ajenas (integridad). Cambiar la regla afecta el endpoint más usado del sistema (edición) y el botón Editar del frontend. |
| **Pregunta al dueño del proceso** | ¿Quién debe poder editar una papeleta en estado PENDIENTE: solo el creador, el jefe del área, RRHH, o cualquiera? ¿Existe un rol de jefe que registra a nombre de su personal? |

### A2. ¿Quién puede anular una papeleta?

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | `DELETE /api/papeletas/eliminar`. No tiene middleware de rol ni validación de autoría: **cualquier usuario autenticado** puede anular cualquier papeleta. Ejecuta `eliminar_PapeletaPermiso_gp` y luego fuerza `EstadoAprobacion='RECHAZADO'` con `RazonRechazo='Anulada desde el sistema'`. |
| **Estado** | ⚠️ DUDA (la autorización es clara en el código; la intención del negocio no). |
| **Riesgo si se cambia** | **Restringir a creador/privilegiados**: puede impedir que un trabajador elimine su propio error o que RRHH depure datos. **Mantener abierto**: cualquier usuario puede anular papeletas de terceros (daño potencial a la operación y a las estadísticas). |
| **Pregunta al dueño del proceso** | ¿Quién debe poder anular una papeleta: el propio trabajador (solo las suyas), el jefe, o solo RRHH/ADMIN? ¿La anulación debe quedar registrada como RECHAZADO o debe tener su propio estado "ANULADO"? |

### A3. ¿Existe realmente aprobación de jefe?

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | El estado `APROBADO_JEFE` **aparece** en el modelo (labels "Aprobado por Jefe", filtros `estado=aprobadas`, estadísticas `pendientesRRHH`, política de cierre), pero **ningún endpoint del backend lo asigna**. El único paso de aprobación implementado es RRHH (`/api/papeletas/gestionar`, solo `APROBADO_RRHH`/`RECHAZADO`). |
| **Estado** | ⚠️ DUDA |
| **Riesgo si se cambia** | Si se elimina el concepto de aprobación de jefe, se pierde el estado intermedio que el negocio podría estar usando por fuera del sistema (proceso manual o futuro). Si se agrega una bandeja de jefe sin confirmación, se añade una etapa que quizá no corresponde. |
| **Pregunta al dueño del proceso** | ¿Existe hoy una aprobación del jefe inmediato antes de RRHH? Si existe, ¿dónde ocurre (manual, en papel, ERP) y debe el sistema incorporarla o solo reflejarla? |

### A4. ¿`APROBADO_JEFE` debe mantenerse o eliminarse?

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | `APROBADO_JEFE` se lee en 4 lugares del backend (filtros `aprobadas`, label, estadísticas, política de edición) y en el frontend (dashboard, badges, botones). Nunca se escribe. Convive con `ActivoPP='2'` como forma de marcar rechazo/anulación. |
| **Estado** | ⚠️ DUDA |
| **Riesgo si se cambia** | **Eliminarlo**: si RRHH u otro proceso lo escribe hoy (manual/ERP), las papeletas con ese estado dejarían de mostrarse como "aprobadas" y se rompería la contabilidad de aprobadas. **Mantenerlo**: permanece como estado huérfano que nadie genera, generando confusión en reportes. |
| **Pregunta al dueño del proceso** | ¿El estado "Aprobado por Jefe" debe existir como etapa real del flujo, eliminarse, o conservarse solo como compatibilidad con datos históricos? |

### A5. ¿Quién puede imprimir?

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | La impresión se hace vía `GET /api/papeletas/:id/pdf` (PDF inline en navegador). Requiere estar autenticado y que la papeleta tenga estado `APROBADO_RRHH`. **No hay restricción de rol**: cualquier usuario autenticado puede imprimir cualquier papeleta aprobada (el endpoint no aplica los filtros de visibilidad de `listar`). |
| **Estado** | ⚠️ DUDA (el código es claro; la intención de negocio sobre la restricción no). |
| **Riesgo si se cambia** | **Restringir a RRHH/ADMIN o al creador**: puede impedir que el colaborador imprima su propia papeleta aprobada (parece ser el uso previsto). **Mantener abierto**: cualquier usuario puede imprimir papeletas ajenas aprobadas (fuga de información). |
| **Pregunta al dueño del proceso** | ¿Quién debe poder imprimir/descargar el PDF de una papeleta aprobada: solo el trabajador dueño, solo RRHH/ADMIN, o cualquier usuario autenticado? |

### A6. ¿Cualquier usuario autenticado puede descargar el PDF?

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | **Sí.** `GET /api/papeletas/:id/pdf` solo valida: (1) estar autenticado, (2) estado `APROBADO_RRHH`. No consulta creador, área ni rol. Con conocer el `IdPP`, cualquier usuario puede descargar el PDF. El frontend, además, habilita el botón PDF para cualquier papeleta con aprobación RRHH visible en pantalla. |
| **Estado** | ⚠️ DUDA |
| **Riesgo si se cambia** | Es el punto con mayor exposición de información si se decide que solo RRHH debe manejar el documento oficial. Cambiarlo afecta directamente la FASE 4 (documentos/impresión). |
| **Pregunta al dueño del proceso** | ¿El PDF es un documento público interno (cualquiera puede verlo) o restringido (solo el colaborador y RRHH)? ¿Debe respetar los mismos filtros de visibilidad que la lista de papeletas? |

### A7. ¿RRHH puede modificar cualquier papeleta?

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | **Sí.** Los roles privilegiados (ADMIN/RRHH) pueden editar papeletas cerradas (`canEditPapeleta` los exime de la restricción) y abiertas (sin restricción). No hay límite por área ni por autoría para ellos. |
| **Estado** | ✅ CONFIRMADA |
| **Riesgo si se cambia** | Si se restringe la edición de RRHH (p. ej. solo el creador), se pierde la capacidad de corrección administrativa de errores en papeletas ya aprobadas. Si se mantiene, RRHH conserva poder total sobre el documento. |
| **Pregunta al dueño del proceso** | ¿RRHH y ADMIN deben poder editar cualquier papeleta, incluidas las ya aprobadas/rechazadas/anuladas? ¿O hay alguna restricción (p. ej. no alterar aprobadas salvo anulándolas)? |

### A8. ¿Un usuario puede aprobar una papeleta creada por él mismo?

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | El endpoint `POST /api/papeletas/gestionar` exige `requireAprobacionRole` (privilegiado) pero **no valida que el aprobador sea distinto del creador**. Un RRHH/ADMIN que creó una papeleta podría aprobarla él mismo. |
| **Estado** | ⚠️ DUDA (no hay check en el código; la política de negocio no es visible). |
| **Riesgo si se cambia** | Agregar la prohibición "no auto-aprobación" impediría que un RRHH apruebe sus propias solicitudes (requeriría que otra persona apruebe). Mantenerla como está deja un posible conflicto de interés sin control. |
| **Pregunta al dueño del proceso** | ¿Un usuario con rol RRHH/ADMIN puede aprobar una papeleta que él mismo creó, o debe aprobarla otra persona? ¿Debe el sistema impedirlo explícitamente? |

### A9. ¿Qué representa exactamente el creador en la firma del jefe?

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | En el PDF, la firma "V°B° Jefe Inmediato" se llena con el **nombre del creador de la papeleta** (`IdUsuarioCreador` → `TBL_USUARIOS`, con fallback a la auditoría `CREAR`, y si no, `JefeInmediato` del reporte). `normalizeSignatureName` descarta valores con `\` o `@` o sin espacio. Esto implica que el sistema asume que **quien registra es el jefe del colaborador**. |
| **Estado** | ⚠️ DUDA |
| **Riesgo si se cambia** | Si el creador no es siempre el jefe, el PDF estamparía la firma equivocada (el nombre de quien digitó, no del jefe real). Cambiar la fuente de la firma altera la salida del documento oficial (FASE 4). |
| **Pregunta al dueño del proceso** | ¿Quién registra normalmente una papeleta: el colaborador o su jefe? ¿El nombre que debe aparecer como "Jefe Inmediato" es el del usuario que la registra, el del jefe del área del colaborador, o debe ser capturado manualmente? |

---

## B. PRIORIDAD MEDIA (reglas de integridad y operación)

### B1. Numeración secuencial de papeletas

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | `NumeroPP = MAX(NumeroPP)+1` dentro de transacción `SERIALIZABLE` con `UPDLOCK, HOLDLOCK`. No hay reinicio por año ni por área. |
| **Estado** | ✅ CONFIRMADA |
| **Riesgo si se cambia** | Modificar el esquema de numeración (p. ej. por año) afecta los números ya impresos, los reportes y la referencia cruzada con auditoría/notificaciones. |
| **Pregunta al dueño del proceso** | ¿La numeración debe ser correlativa global sin reinicio, o debe reiniciarse cada año? |

### B2. Una papeleta activa no se duplica por trabajador+fecha (cruce horario)

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | Al crear/editar se rechaza (409) si el mismo `DOIPP`+fecha tiene otra papeleta activa con rango horario solapado (`nuevo.start < existente.end && nuevo.end > existente.start`). Además el índice `UX_Papeleta_Trabajador_Fecha_Activa` devuelve mensaje de duplicado. |
| **Estado** | ✅ CONFIRMADA |
| **Riesgo si se cambia** | Permitir solapes podría generar conflictos operativos (doble salida simultánea). Endurecer (bloquear incluso permisos consecutivos en el mismo día) podría impedir salidas válidas (mañana y tarde). |
| **Pregunta al dueño del proceso** | ¿Un trabajador puede tener más de un permiso el mismo día siempre que no se solapen las horas, o debe limitarse a un solo permiso diario? |

### B3. Restauración pierde datos de aprobación

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | `PATCH /api/papeletas/restaurar` lleva cualquier papeleta a `PENDIENTE` y borra `AprobadoPorRRHH`, `FechaAprobacionRRHH`, `RazonRechazo`. No condiciona el estado previo (puede restaurar una papeleta ya aprobada, perdiendo su aprobación). |
| **Estado** | ⚠️ DUDA |
| **Riesgo si se cambia** | Si se permite restaurar aprobadas, se pierde la trazabilidad de que alguna vez fue aprobada (la auditoría sí lo conserva, pero el registro activo no). Si se prohíbe, se limita la corrección de errores. |
| **Pregunta al dueño del proceso** | ¿Debe poder restaurarse una papeleta ya aprobada por RRHH, o la restauración es solo para anuladas/rechazadas? ¿Debe conservarse algún rastro del estado previo en el registro? |

### B4. PDF solo después de aprobación RRHH

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | `canDownloadDocument`: el PDF exige estado `APROBADO_RRHH` (403 si no). Ni el creador ni RRHH pueden imprimir antes. |
| **Estado** | ✅ CONFIRMADA |
| **Riesgo si se cambia** | Permitir imprimir en estados previos rompería el control del documento oficial. Este es un invariante central. |
| **Pregunta al dueño del proceso** | ¿El documento oficial debe emitirse únicamente tras la aprobación de RRHH? ¿Hay algún caso (emergencia) que deba imprimirse antes y con qué registro? |

### B5. Exportar Excel exige mes y año

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | `GET /api/papeletas/exportar-excel` requiere `mes` (1-12) y `anio` (2000-2100); sin ellos responde 400. Respeta los filtros de visibilidad (área/creador). |
| **Estado** | ✅ CONFIRMADA |
| **Riesgo si se cambia** | Permitir exportar sin rango aumentaría el volumen y podría exponer datos fuera del periodo deseado. |
| **Pregunta al dueño del proceso** | ¿El reporte Excel debe ser siempre mensual (mes+año) o debe permitirse un rango de fechas libre? |

### B6. Gestión de usuarios ERP solo ADMIN

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | Política `canManageUsers`: solo roles `ADMIN`/`ADMINISTRADOR`/`ADMINISTRADOR DEL SISTEMA` pueden asignar roles/bloquear/ver panel ERP. RRHH queda excluido (aunque es privilegiado para papeletas). |
| **Estado** | ✅ CONFIRMADA |
| **Riesgo si se cambia** | Dar gestión ERP a RRHH ampliaría privilegios de asignación de roles (impacto en todo el sistema). |
| **Pregunta al dueño del proceso** | ¿Debe RRHH poder gestionar usuarios/roles ERP o solo ADMIN? |

### B7. Sincronización de trabajadores solo privilegiados; sin alta manual

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | `POST /api/trabajadores/sync` exige rol privilegiado; `insertar/editar/eliminar` manuales devuelven 405 fijo ("Los trabajadores se sincronizan desde ERP (cache)"). |
| **Estado** | ✅ CONFIRMADA |
| **Riesgo si se cambia** | Habilitar alta manual rompería la fuente única de verdad (ERP) y podría desincronizar el cache. |
| **Pregunta al dueño del proceso** | ¿Los trabajadores deben seguir viniendo exclusivamente del ERP, sin mantenimiento manual en este sistema? |

### B8. Perfil y contraseña editables solo para cuentas locales

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | `PUT /api/usuarios/perfil` devuelve 403 "Perfil ERP no editable desde este modulo" para usuarios sin `id` local. El cambio de contraseña valida la actual con `sp_login_usuario` y escribe hash pbkdf2 en `TBL_USUARIOS`. |
| **Estado** | ✅ CONFIRMADA |
| **Riesgo si se cambia** | Permitir edición de perfil ERP implicaría escribir en el ERP (fuera de alcance actual). |
| **Pregunta al dueño del proceso** | ¿El perfil del usuario ERP debe editarse solo en el ERP? ¿El cambio de contraseña local es un mecanismo esperado o solo temporal? |

### B9. Auditoría obligatoria en todas las mutaciones

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | Toda mutación registra `TBL_AUDITORIA` (CREAR, EDITAR, ANULAR, RESTAURAR, APROBAR_RRHH, RECHAZAR_RRHH) con IP, navegador y datos anterior/nuevo. |
| **Estado** | ✅ CONFIRMADA |
| **Riesgo si se cambia** | Reducir la auditoría degrada la trazabilidad legal/operativa del sistema. |
| **Pregunta al dueño del proceso** | ¿Existe algún periodo de retención requerido para la bitácora de auditoría? |

### B10. Notificaciones por evento

| Aspecto | Detalle |
|---|---|
| **Regla actual en código** | Al crear → notifica a todos los RRHH activos. Al aprobar/rechazar → notifica al creador (`IdUsuarioCreador`). |
| **Estado** | ✅ CONFIRMADA |
| **Riesgo si se cambia** | Cambiar destinatarios afecta la operación diaria de RRHH y la comunicación con el trabajador. |
| **Pregunta al dueño del proceso** | ¿Los destinatarios de notificaciones (RRHH al crear, creador al aprobar/rechazar) son los correctos? |

---

## C. DECISIONES A CONGELAR ANTES DE FASE 4

Resumen de las preguntas que requieren respuesta del dueño del proceso para desbloquear la FASE 4 (documentos/impresión) y la refactorización:

| # | Pregunta | Impacto directo en |
|---|---|---|
| A1 | ¿Quién edita una papeleta PENDIENTE? | Edición, visibilidad |
| A2 | ¿Quién anula una papeleta y con qué estado? | Anulación, estados |
| A3 | ¿Existe aprobación de jefe real? | Flujo, estados |
| A4 | ¿Mantener o eliminar `APROBADO_JEFE`? | Modelo de estados |
| A5/A6 | ¿Quién imprime/descarga el PDF? | **PDF, FASE 4** |
| A7 | ¿RRHH modifica cualquier papeleta? | Permisos |
| A8 | ¿Auto-aprobación permitida? | Aprobación |
| A9 | ¿Quién es el "Jefe Inmediato" en la firma? | **PDF, FASE 4** |
| B3 | ¿Restaurar aprobadas? | Restauración |
| B5 | ¿Exportar por rango o solo mensual? | Excel |

**Formato sugerido de respuesta por cada decisión:**
```
Regla: A5 - ¿Quién imprime/descarga el PDF?
Decisión: [SOLO RRHH / CREADOR / CUALQUIERA AUTENTICADO]
Fecha: ___
Responsable: ___
```

---

*Fin de la matriz. Sin cambios de código realizados.*
