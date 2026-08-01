// src/documents/papeleta-pdf.document.js
// Vista de generacion del PDF de papeleta. Contiene unicamente la parte
// documental movida verbatim desde routes/papeletas.routes.js: creacion PDFKit,
// layout, firmas, posiciones y formatos. No contiene SQL ni reglas de negocio;
// recibe los datos ya preparados por flujo.service ({ data, copyLabels, paper })
// y responde exactamente igual que el legacy (mismo tamaño, contenido, orden
// y headers).

function createPapeletaPdfDocument(deps) {
  const { PDFDocument, fs, path, backendDir } = deps;
  if (!PDFDocument) {
    throw new Error('createPapeletaPdfDocument: falta PDFDocument');
  }

  const renderPapeletaPdf = (res, { data, copyLabels, paper }) => {
    try {
      const numero = data.numero;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Papeleta_${numero}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-PDF-Paper', paper);

      const sizeByPaper = {
        A4: 'A4',
        A5: 'A5'
      };
      const doc = new PDFDocument({
        size: sizeByPaper[paper] || 'A4',
        // Formato clasico amplio como el ejemplo.
        layout: 'landscape',
        margin: 14
      });
      doc.pipe(res);

      const page = doc.page;
      const pageW = page.width;
      const pageH = page.height;

      const sectionX = 14;
      const sectionW = pageW - (sectionX * 2);
      const sectionH = 184;
      const sectionGap = 10;

      const logoPath = path.join(backendDir, '..', 'img', 'logo-gp.png');
      const hasLogo = fs.existsSync(logoPath);

      const drawField = (label, value, x, y, labelW, lineW, fontSize = 8.5) => {
        const fitSingleLine = (input, maxWidth) => {
          let text = String(input || '').replace(/\s+/g, ' ').trim();
          if (!text) return '';
          if (doc.widthOfString(text) <= maxWidth) return text;
          const ellipsis = '...';
          while (text.length > 0 && (doc.widthOfString(text + ellipsis) > maxWidth)) {
            text = text.slice(0, -1);
          }
          return text ? `${text}${ellipsis}` : '';
        };
        doc.font('Helvetica-Bold').fontSize(fontSize).text(label, x, y, {
          width: labelW,
          lineBreak: false,
          ellipsis: true
        });
        const valueX = x + labelW;
        doc.font('Helvetica').fontSize(fontSize);
        const safeValue = fitSingleLine(value, Math.max(20, lineW - 6));
        doc.text(safeValue, valueX + 2, y, {
          width: Math.max(20, lineW - 4),
          lineBreak: false,
          height: fontSize + 2
        });
        doc.moveTo(valueX, y + 12).lineTo(valueX + lineW, y + 12).lineWidth(0.5).stroke();
      };

      const drawBox = (label, value, x, y, labelW, boxW, fontSize = 8.5, boxH = 14) => {
        doc.font('Helvetica-Bold').fontSize(fontSize).text(label, x, y, {
          width: labelW,
          lineBreak: false,
          ellipsis: true
        });
        const boxX = x + labelW;
        const boxY = y + 4;
        doc.rect(boxX, boxY, boxW, boxH).lineWidth(0.6).stroke();
        doc.font('Helvetica').fontSize(fontSize).text(value || '', boxX, boxY + 3, {
          width: boxW,
          align: 'center'
        });
      };

      const drawSection = (idx, yTop, labels, copiesCount) => {
        const titleFs = 12;
        const labelFs = 10;
        const fieldFs = 8.5;
        const signFs = 7;

        const leftX = sectionX + 2;

        const gap = Math.floor(sectionW * 0.02);
        const rightColW = Math.min(190, Math.max(160, Math.floor(sectionW * 0.30)));
        const leftColW = sectionW - rightColW - gap;
        const rightX = sectionX + leftColW + gap;

        const leftLabelW = Math.min(115, Math.floor(leftColW * 0.32));
        const leftLineW = Math.max(80, leftColW - leftLabelW - 6);

        const rightLabelW = Math.floor(rightColW * 0.46);
        const rightBoxW = Math.max(60, rightColW - rightLabelW);

        doc.font('Helvetica-Bold').fontSize(titleFs).text(
          `PAPELETA DE PERMISO N° ${String(data.numero).padStart(4, '0')}`,
          sectionX,
          yTop + 2,
          { width: leftColW, align: 'center', ellipsis: true }
        );
        doc.font('Helvetica-Bold').fontSize(labelFs).text('Fecha Emision:', rightX, yTop + 2, {
          width: rightLabelW,
          lineBreak: false,
          ellipsis: true
        });
        doc.rect(rightX + rightLabelW, yTop, rightBoxW, 16).lineWidth(0.7).stroke();
        doc.font('Helvetica').fontSize(labelFs).text(data.fechaEmision, rightX + rightLabelW, yTop + 4, { width: rightBoxW, align: 'center' });

        let y = yTop + 32;
        drawField('DOI:', data.doi, leftX, y, leftLabelW, leftLineW, fieldFs); y += 17;
        drawField('Nombres y Apellidos:', data.trabajador, leftX, y, leftLabelW, leftLineW, fieldFs); y += 17;
        drawField('Cargo:', data.cargo, leftX, y, leftLabelW, leftLineW, fieldFs); y += 17;
        drawField('Area:', data.area, leftX, y, leftLabelW, leftLineW, fieldFs); y += 17;
        drawField('Motivo del permiso:', data.motivo, leftX, y, leftLabelW, leftLineW, fieldFs); y += 17;
        drawField('A considerar:', data.considerar, leftX, y, leftLabelW, leftLineW, fieldFs);

        doc.font('Helvetica-Bold').fontSize(labelFs).text('Fecha Permiso:', rightX, yTop + 38, {
          width: rightLabelW,
          lineBreak: false,
          ellipsis: true
        });
        doc.rect(rightX + rightLabelW, yTop + 36, rightBoxW, 16).lineWidth(0.7).stroke();
        doc.font('Helvetica').fontSize(labelFs).text(data.fechaPermiso, rightX + rightLabelW, yTop + 40, { width: rightBoxW, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(labelFs).text('Duracion del Permiso:', rightX, yTop + 58, {
          width: rightColW,
          lineBreak: false,
          ellipsis: true
        });

        drawBox('Salida:', data.salida, rightX, yTop + 78, rightLabelW, rightBoxW, fieldFs);
        drawBox('Retorno:', data.retorno, rightX, yTop + 98, rightLabelW, rightBoxW, fieldFs);
        drawBox('Tiempo:', data.tiempo, rightX, yTop + 118, rightLabelW, rightBoxW, fieldFs);

        const sigY = yTop + sectionH - 22;
        const sigGap = Math.floor(sectionW * 0.05);
        const sigLeft = sectionX + 10;
        const sigRight = sectionX + sectionW - 10;
        const sigTotalW = sigRight - sigLeft;
        const sigW = Math.floor((sigTotalW - sigGap * 2) / 3);
        const s1 = sigLeft;
        const s2 = s1 + sigW + sigGap;
        const s3 = s2 + sigW + sigGap;

        if (hasLogo) {
          const logoW = 26;
          const logoH = 26;
          // Mantener el logo dentro de la zona de firmas para que no invada "A considerar"
          const logoX = s1 + 6;
          const logoY = sigY - logoH - 4;
          doc.image(logoPath, logoX, logoY, { width: logoW, height: logoH });
        }

        doc.moveTo(s1, sigY).lineTo(s1 + sigW, sigY).lineWidth(0.7).stroke();
        doc.moveTo(s2, sigY).lineTo(s2 + sigW, sigY).lineWidth(0.7).stroke();
        doc.moveTo(s3, sigY).lineTo(s3 + sigW, sigY).lineWidth(0.7).stroke();

        if (data.jefeFirmaNombre) {
          doc.font('Helvetica').fontSize(Math.max(6.2, signFs + 0.2)).text(data.jefeFirmaNombre, s1, sigY - 9, { width: sigW, align: 'center', ellipsis: true });
        }
        doc.font('Helvetica').fontSize(signFs).text('V°B° Jefe Inmediato', s1, sigY + 3, { width: sigW, align: 'center' });
        doc.font('Helvetica').fontSize(signFs).text('V°B° Gestion Humana', s2, sigY + 3, { width: sigW, align: 'center' });
        doc.font('Helvetica').fontSize(signFs).text('Colaborador', s3, sigY + 3, { width: sigW, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(signFs + 0.2).text(labels[idx] || labels[0], rightX, yTop + 142, { width: rightColW, align: 'right' });

        if (idx < copiesCount - 1) {
          const sepY = yTop + sectionH + 2;
          doc.moveTo(sectionX, sepY).lineTo(sectionX + sectionW, sepY).lineWidth(1.3).stroke();
        }
      };

      const labels = copyLabels;
      const copies = labels.length;
      const baseW = sectionW;
      const baseTotalH = (copies * sectionH) + ((copies - 1) * sectionGap);
      const availableW = pageW - (sectionX * 2);
      const availableH = pageH - 28;
      const scale = Math.min(availableW / baseW, availableH / baseTotalH);

      const drawX = (pageW - (baseW * scale)) / 2 - (sectionX * scale);
      const freeHUnscaled = Math.max(0, (availableH / scale) - baseTotalH);
      // Evitar huecos gigantes en vertical: solo expandir ligeramente el separador.
      const extraGapUnscaled = (copies > 1 && freeHUnscaled > 0)
        ? Math.min(26, freeHUnscaled / (copies - 1))
        : 0;
      const sectionStep = sectionH + sectionGap + extraGapUnscaled;
      const totalDrawUnscaled = (copies * sectionH) + ((copies - 1) * (sectionGap + extraGapUnscaled));
      const drawY = (pageH - (totalDrawUnscaled * scale)) / 2;

      for (let i = 0; i < copies; i++) {
        const y = i * sectionStep;
        doc.save();
        doc.translate(drawX, drawY + (y * scale));
        doc.scale(scale, scale);
        drawSection(i, 0, labels, copies);
        doc.restore();
      }

      doc.end();
    } catch (err) {
      console.error('? Error generando PDF inline:', err.message);
      if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
    }
  };

  return { renderPapeletaPdf };
}

module.exports = { createPapeletaPdfDocument };
