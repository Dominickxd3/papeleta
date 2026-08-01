# REFACTORIZACION_BACKEND_PAPELETAS_FINAL.md

Documento final de la refactorización del backend de papeletas de permiso.
Describe el estado antes/después de la arquitectura y las fases completadas.

## Antes

Un único archivo monolítico concentraba toda la responsabilidad:

| Archivo | Líneas | Contenido |
|---|---|---|
| `backend/routes/papeletas.routes.js` | **1804 líneas** | Rutas + validación + lógica de negocio + SQL + Excel + PDF mezclados |

Un solo endpoint (`:id/pdf`) ocupaba ~400 líneas con PDFKit embebido, y el
reporte Excel construía el workbook dentro del handler. No había separación
entre HTTP, negocio y acceso a datos.

## Después

La responsabilidad se dividió en capas bajo `backend/src/`:

| Capa | Módulos |
|---|---|
| **routes** | `src/routes/papeletas.routes.js` — registra los 13 endpoints y delega en el controller (sin SQL, sin negocio, sin PDF/Excel) |
| **controllers** | `src/controllers/papeletas.controller.js` — 13 handlers que orquestan flujo y respuestas HTTP |
| **services** | `src/services/papeleta.flujo.service.js` — orquestación de casos de uso; `papeleta.negocio.service.js` — reglas de negocio (cruce horario, visibilidad); `papeleta.estado-cache.js` — caché TTL de por-estado |
| **repositories** | `src/repositories/papeleta.repository.js`, `papeleta.auditoria.repository.js`, `papeleta.esquema.repository.js`, `erp.acceso.repository.js` — acceso a datos (SP/consultas idénticos al original) |
| **documents** | `src/documents/papeleta-pdf.document.js` — render PDF (layout/firmas/posiciones verbatim); `papeleta-excel.document.js` — armado del workbook Excel (plantilla, estilos, horas, filtros) |
| **security** | `src/security/roles.js`, `src/security/policy.js` |
| **validators** | `src/validators/papeleta.validator.js`, `papeleta.error.service.js` |
| **middlewares** | `src/middlewares/authorize.js` |

### Contrato HTTP sin cambios

- Mismas 13 rutas, métodos, paths, parámetros y middlewares que el original.
- Respuestas JSON idénticas (mensajes exactos, mojibake legacy incluido).
- PDF: headers exactos (`Content-Type`, `Cache-Control: no-store`, `X-PDF-Paper`).
- Excel: mismo nombre de archivo, mismo contenido y estructura de hojas.

## Fases completadas

1. **FASE 1 — Validators**: extracción y normalización de validaciones de
   entrada (fechas, horas, rangos de vacaciones).
2. **FASE 2 — Repositories**: acceso a datos con SQL/SP idénticos, probado
   contra BD viva.
3. **FASE 3 — Services**: flujo de casos de uso completo (crear/editar/anular/
   restaurar/gestionar/listar/por-estado/reporte/historial/ultimo-numero/PDF/
   Excel) + estado-cache. QA 39/39 + SQL-diff 15/15.
4. **FASE 4A — Controller**: 13 handlers que replican el contrato HTTP.
   QA 26/26.
5. **FASE 4B-1 — Documents**: extracción de PDF (PDFKit) y Excel (ExcelJS) a
   `src/documents/`. QA 18/18 (incluye comparación de fuente contra legacy).
6. **FASE 4C-1 — Nuevas rutas**: `src/routes/papeletas.routes.js` aisladas,
   100% equivalentes (comparación 12/12) + smoke aislado 16/16.
7. **FASE 4C-2 — Conmutación**: `server.js` pasa a usar la nueva arquitectura
   (cambio de 1 línea). Smoke real 23/23. Backup
   `server.js.backup_before_papeletas_migration` y checkpoint `aa399bc`.
8. **FASE 5 — Limpieza**: eliminación del legacy `routes/papeletas.routes.js`
   (sin referencias activas). Smoke real reducido 10/10 sin errores.

## Estado final

- El servidor usa exclusivamente la nueva arquitectura
  (`src/routes/papeletas.routes.js`).
- El legacy `backend/routes/papeletas.routes.js` fue eliminado.
- No se eliminó: nueva arquitectura `src/`, documentación (`docs/`), backups,
  ni archivos SQL históricos.
- El registro histórico y el código original permanecen en git (checkpoint
  `aa399bc`) para rollback.
