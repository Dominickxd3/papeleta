const ExcelJS = require('exceljs');
(async()=>{
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('C:/Users/Administradorr/Downloads/PAPELETA DE PERMISO FORMATO.xlsx');
  console.log('sheets', wb.worksheets.map(s=>s.name));
  const ws = wb.worksheets[0];
  console.log('sheet0', ws.name, 'rows', ws.rowCount, 'cols', ws.columnCount);
  for(let c=1;c<=26;c++){
    const v=ws.getRow(1).getCell(c).value;
    if(v!==null && v!=='') console.log(c, String(v));
  }
  for(let c=1;c<=26;c++){
    const v=ws.getRow(2).getCell(c).value;
    if(v!==null && v!=='') console.log('r2',c, String(v));
  }
})();
