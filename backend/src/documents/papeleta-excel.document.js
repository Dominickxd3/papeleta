// src/documents/papeleta-excel.document.js
// Vista de generacion del Excel de papeletas. Contiene unicamente la parte
// documental movida verbatim desde routes/papeletas.routes.js: plantilla,
// encabezados, estilos, formulas, fechas, horas y filtros. No contiene SQL ni
// reglas de negocio; recibe las filas ya consultadas/filtradas por
// flujo.service y devuelve { workbook, file } listos para streamear.

function createPapeletaExcelDocument(deps) {
  const { ExcelJS, fs, path, backendDir } = deps;
  if (!ExcelJS) {
    throw new Error('createPapeletaExcelDocument: falta ExcelJS');
  }

  const construirWorkbook = async ({ rows: rowsFiltradas, mes, anio }) => {
    const workbook = new ExcelJS.Workbook();
    const templateCandidates = [
      process.env.EXCEL_TEMPLATE_PATH,
      path.join(backendDir, 'templates', 'PAPELETA DE PERMISO FORMATO.xlsx'),
      path.join(backendDir, '..', 'templates', 'PAPELETA DE PERMISO FORMATO.xlsx')
    ].filter(Boolean);

    const templatePath = templateCandidates.find((p) => fs.existsSync(p));
    let ws = null;

    if (templatePath) {
      await workbook.xlsx.readFile(templatePath);
      ws = workbook.getWorksheet('Hoja2') || workbook.worksheets[0];
      for (const sh of [...workbook.worksheets]) {
        if (sh.id !== ws.id) workbook.removeWorksheet(sh.id);
      }
    } else {
      ws = workbook.addWorksheet('Reporte');
      ws.columns = [
        { header: 'ITEM', key: 'ITEM', width: 8 },
        { header: 'ID_PP', key: 'ID_PP', width: 10 },
        { header: 'FECHA_REGISTRO', key: 'FECHA_REGISTRO', width: 14 },
        { header: 'USUARIO_REGISTRO', key: 'USUARIO_REGISTRO', width: 24 },
        { header: 'FECHA_MODIFICACION', key: 'FECHA_MODIFICACION', width: 16 },
        { header: 'USUARIO_MODIFICACION', key: 'USUARIO_MODIFICACION', width: 24 },
        { header: 'FECHA_EMISION', key: 'FECHA_EMISION', width: 14 },
        { header: 'FECHA_PERMISO', key: 'FECHA_PERMISO', width: 14 },
        { header: 'NUMERO_PP', key: 'NUMERO_PP', width: 10 },
        { header: 'DOI', key: 'DOI', width: 12 },
        { header: 'TRABAJADOR', key: 'TRABAJADOR', width: 36 },
        { header: 'CARGO', key: 'CARGO', width: 30 },
        { header: 'AREA', key: 'AREA', width: 30 },
        { header: 'MOTIVO', key: 'MOTIVO', width: 40 },
        { header: 'CONSIDERAR', key: 'CONSIDERAR', width: 34 },
        { header: 'SALIDA', key: 'SALIDA', width: 10 },
        { header: 'RETORNO', key: 'RETORNO', width: 10 },
        { header: 'TIEMPO', key: 'TIEMPO', width: 10 },
        { header: 'OBSERVACIONES', key: 'OBSERVACIONES', width: 42 },
        { header: 'ACTIVO', key: 'ACTIVO', width: 8 }
      ];
    }

    const header1 = String(ws.getRow(1).getCell(1).value || '').trim().toUpperCase();
    const header2 = String(ws.getRow(1).getCell(2).value || '').trim().toUpperCase();
    const header3 = String(ws.getRow(1).getCell(3).value || '').trim().toUpperCase();
    if (header1 === 'ELIMINAR' && header2 === 'EDITAR' && header3 === 'IMPRIMIR') {
      ws.spliceColumns(1, 3);
    }
    ws.getRow(1).getCell(4).value = 'USUARIO_REGISTRO';
    ws.getRow(1).getCell(6).value = 'USUARIO_MODIFICACION';
    ws.getRow(1).getCell(14).value = 'MOTIVO_DESCRIPTIVO';
    ws.getRow(1).getCell(15).value = 'CONSIDERAR_DESCRIPTIVO';

    const templateStyles = [];
    const styleSourceRow = ws.getRow(2);
    for (let col = 1; col <= 20; col++) {
      templateStyles[col] = JSON.parse(JSON.stringify(styleSourceRow.getCell(col).style || {}));
    }

    const fmtDate = (v) => {
      if (!v) return '';
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return '';
      return d;
    };

    const fmtTime = (v) => {
      if (!v) return '';

      if (v instanceof Date && !Number.isNaN(v.getTime())) {
        const hh = String(v.getUTCHours()).padStart(2, '0');
        const mm = String(v.getUTCMinutes()).padStart(2, '0');
        const ss = String(v.getUTCSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
      }

      const s = String(v).trim();
      const m = s.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
      if (!m) return s;
      const hh = String(Number(m[1] || 0)).padStart(2, '0');
      const mm = String(Number(m[2] || 0)).padStart(2, '0');
      const ss = String(Number(m[3] || 0)).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    };

    const fmtUser = (v) => {
      const s = String(v || '').trim();
      if (!s) return 'SIN USUARIO';
      if (/^PC[\-_ ]/i.test(s)) return 'SIN USUARIO';
      return s;
    };

    const fmtMotivo = (v) => String(v || '').replace(/\s+/g, ' ').trim();

    const fmtConsiderar = (v) => {
      const raw = String(v || '').trim();
      if (!raw) return '';

      const match = raw.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const tipo = String(match[1] || '').trim();
        const detalle = String(match[2] || '').trim();
        return detalle ? `${tipo}: ${detalle}` : tipo;
      }

      if (/^(?:1\/2\s*dia\s*)?a cuenta de vacaciones$/i.test(raw)) return '1/2 dia a cuenta de vacaciones';
      if (/^vacaciones$/i.test(raw)) return 'Vacaciones';
      if (/^compensaci[oó]n$/i.test(raw)) return 'Compensacion';
      return raw;
    };

    if (ws.rowCount > 1) {
      ws.spliceRows(2, ws.rowCount - 1);
    }
    if (ws.model && Array.isArray(ws.model.tables) && ws.model.tables.length > 0) {
      ws.model.tables = [];
    }

    let item = 1;
    for (const row of rowsFiltradas) {
      const newRow = ws.addRow([
        item++,
        row.IdPP || '',
        fmtDate(row.FechaRegistroPP),
        fmtUser(row.UsuarioRegistro),
        fmtDate(row.FechaModificacionPP),
        fmtUser(row.UsuarioModificacion),
        fmtDate(row.FechaEmisionPP),
        fmtDate(row.FechaPermisoPP),
        row.NumeroPP || '',
        row.DOIPP || '',
        row.TrabajadorPP || '',
        row.CargoPP || '',
        row.AreaPP || '',
        fmtMotivo(row.MotivoPP),
        fmtConsiderar(row.ConsiderarPP),
        fmtTime(row.HSalidaPP),
        fmtTime(row.HRetornoPP),
        fmtTime(row.TiempoPP),
        row.ObservacionesPP || '',
        String(row.ActivoPP || '') === '1' ? 'SI' : 'NO'
      ]);

      for (let col = 1; col <= 20; col++) {
        if (templateStyles[col]) {
          newRow.getCell(col).style = JSON.parse(JSON.stringify(templateStyles[col]));
        }
      }
      [16, 17, 18].forEach((timeCol) => {
        const cell = newRow.getCell(timeCol);
        cell.numFmt = '@';
        cell.value = String(cell.value || '');
      });
    }

    ws.getRow(1).font = ws.getRow(1).font || { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 20 }
    };

    const nombreArchivo = `reporte_papeletas_${anio}_${String(mes).padStart(2, '0')}.xlsx`;
    return {
      workbook,
      file: {
        nombreArchivo,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentDisposition: `attachment; filename="${nombreArchivo}"`
      }
    };
  };

  return { construirWorkbook };
}

module.exports = { createPapeletaExcelDocument };
