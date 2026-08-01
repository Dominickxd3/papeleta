// ==========================================
// USUARIOS VIEW - Solo renderizado (sin fetch, sin reglas de negocio)
// ==========================================
// Depende de: utils/usuarios-formatters.js

class UsuariosView {
  static renderStats(stats = {}) {
    document.getElementById('stTotal').textContent = Number(stats.TotalUsuarios || 0);
    document.getElementById('stActivos').textContent = Number(stats.UsuariosERPActivos || 0);
    document.getElementById('stAdmins').textContent = Number(stats.Administradores || 0);
    document.getElementById('stStandard').textContent = Number(stats.UsuariosEstandar || 0);
  }

  static setSelectedUser(user) {
    const card = document.getElementById('erpSelectedUser');
    if (!card) return;

    if (!user) {
      card.style.display = 'none';
      return;
    }

    document.getElementById('suNombre').textContent = user.User_Fullname || '-';
    document.getElementById('suLogon').textContent = user.User_Logon || '-';
    document.getElementById('suEmail').textContent = user.User_Email || '-';
    document.getElementById('suEstado').textContent = UsuariosFormatters.formatErpEstado(user.User_Estado);

    card.style.display = '';
  }

  static hideSearchResults() {
    const box = document.getElementById('erpSearchResults');
    if (!box) return;
    box.style.display = 'none';
    box.innerHTML = '';
  }

  static showSearchMessage(message) {
    const box = document.getElementById('erpSearchResults');
    if (!box) return;
    box.innerHTML = `<div class="search-result-empty">${message}</div>`;
    box.style.display = '';
  }

  static renderSearchResults({ rows, activeIndex, onPick, onRerender }) {
    const box = document.getElementById('erpSearchResults');
    if (!box) return activeIndex;

    if (!Array.isArray(rows) || rows.length === 0) {
      box.innerHTML = '<div class="search-result-empty">Sin resultados para la búsqueda.</div>';
      box.style.display = '';
      return activeIndex;
    }

    if (activeIndex < 0 || activeIndex >= rows.length) activeIndex = 0;

    box.innerHTML = rows.map((row, idx) => {
      const logon = String(row.User_Logon || '');
      const nombre = String(row.User_Fullname || 'Sin nombre');
      const email = String(row.User_Email || 'Sin email');
      const rol = String(row.RolApp || 'USUARIO').toUpperCase();
      return `
        <div class="search-result-item ${idx === activeIndex ? 'is-active' : ''}" data-logon="${logon}" data-index="${idx}">
          <div class="sr-main">
            <span class="sr-avatar">${logon.slice(0, 1).toUpperCase() || 'U'}</span>
            <div class="sr-content">
              <div class="sr-name">${nombre}</div>
              <div class="sr-sub">${logon}${email ? ` - ${email}` : ''}</div>
            </div>
          </div>
          <div class="sr-top">
            <span class="sr-role">${rol}</span>
          </div>
        </div>
      `;
    }).join('');

    box.style.display = '';

    box.querySelectorAll('.search-result-item').forEach((item) => {
      item.addEventListener('mouseenter', () => {
        const idx = Number(item.getAttribute('data-index') || -1);
        if (idx < 0) return;
        if (typeof onRerender === 'function') onRerender(idx);
      });

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });

      item.addEventListener('click', () => {
        const idx = Number(item.getAttribute('data-index') || -1);
        if (idx >= 0) {
          if (typeof onPick === 'function') onPick(idx);
          return;
        }
        const logon = item.getAttribute('data-logon') || '';
        if (typeof onPick === 'function') onPick(logon);
      });
    });

    return activeIndex;
  }

  static renderPager({ total, totalPages, startIdx, endIdx, currentPage }) {
    const info = document.getElementById('rolesPagerInfo');
    const current = document.getElementById('rolesPgCurrent');
    const bFirst = document.getElementById('rolesPgFirst');
    const bPrev = document.getElementById('rolesPgPrev');
    const bNext = document.getElementById('rolesPgNext');
    const bLast = document.getElementById('rolesPgLast');

    if (info) {
      const startHuman = total === 0 ? 0 : (startIdx + 1);
      info.textContent = `Mostrando ${startHuman}-${endIdx} de ${total} usuarios`;
    }
    if (current) current.textContent = `${currentPage} / ${totalPages}`;

    const atStart = currentPage <= 1;
    const atEnd = currentPage >= totalPages;
    if (bFirst) bFirst.disabled = atStart;
    if (bPrev) bPrev.disabled = atStart;
    if (bNext) bNext.disabled = atEnd;
    if (bLast) bLast.disabled = atEnd;
  }

  static renderPanelTable(pageRows, { onEdit, onHistory } = {}) {
    const body = document.getElementById('erpRolesBody');
    if (!body) return;
    body.innerHTML = '';

    if (!Array.isArray(pageRows) || pageRows.length === 0) {
      body.innerHTML = '<tr><td colspan="7">Sin usuarios para este filtro.</td></tr>';
      return;
    }

    for (const row of pageRows) {
      const logon = String(row.User_Logon || '');
      const nombre = String(row.User_Fullname || '-');
      const email = String(row.User_Email || '-');
      const rol = String(row.RolApp || 'USUARIO').toUpperCase();
      const estado = String(row.RolActivo || '1') === '1' ? 'Activo' : 'Bloqueado';
      const ultima = UsuariosFormatters.formatDateTime(row.UltimaConexion);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${logon}</td>
        <td>${nombre}</td>
        <td>${email}</td>
        <td>${rol}</td>
        <td>${estado}</td>
        <td>${ultima}</td>
        <td>
          <div class="actions-wrap">
            <button type="button" class="roles-btn-mini" data-edit="${logon}">Editar rol</button>
            <button type="button" class="roles-btn-mini" data-history="${logon}">Historial</button>
          </div>
        </td>
      `;

      body.appendChild(tr);
    }

    body.querySelectorAll('button[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const logon = btn.getAttribute('data-edit') || '';
        if (typeof onEdit === 'function') onEdit(logon);
      });
    });

    body.querySelectorAll('button[data-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const logon = btn.getAttribute('data-history') || '';
        if (typeof onHistory === 'function') onHistory(logon);
      });
    });
  }

  static openHistorial(userLogon) {
    const modal = document.getElementById('auditModal');
    const body = document.getElementById('auditBody');
    const title = document.getElementById('auditTitle');
    if (!modal || !body || !title) return;

    title.textContent = `Historial de ${userLogon}`;
    body.innerHTML = 'Cargando...';
    modal.style.display = '';
  }

  static renderHistorial(rows) {
    const body = document.getElementById('auditBody');
    if (!body) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      body.innerHTML = '<div class="audit-row">Sin movimientos registrados.</div>';
      return;
    }

    body.innerHTML = rows.map((r) => `
      <div class="audit-row">
        <div><strong>${r.TipoEvento || '-'}</strong></div>
        <div>${r.Detalle || '-'}</div>
        <div class="audit-meta">${UsuariosFormatters.formatDateTime(r.FechaEvento)} | ${r.RealizadoPor || 'SYSTEM'}</div>
      </div>
    `).join('');
  }

  static renderHistorialError(message) {
    const body = document.getElementById('auditBody');
    if (!body) return;
    body.innerHTML = `<div class="audit-row">${message || 'No se pudo cargar historial.'}</div>`;
  }

  static closeHistorial() {
    const modal = document.getElementById('auditModal');
    if (modal) modal.style.display = 'none';
  }
}

window.UsuariosView = UsuariosView;
console.log('✅ UsuariosView loaded');
