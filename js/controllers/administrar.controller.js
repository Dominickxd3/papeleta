(function () {
  let searchRows = [];
  let selectedUser = null;
  let searchTimer = null;
  let activeSearchIndex = -1;
  let currentSegment = 'all';
  let panelRows = [];
  let currentPage = 1;
  let pageSize = 20;

  function notify(msg) {
    alert(msg);
  }

  function normalizeRole(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function readStoredUser() {
    const raw = localStorage.getItem('usuario');
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function isAdminRole(role) {
    const r = normalizeRole(role);
    return r === 'ADMIN' || r === 'ADMINISTRADOR' || r === 'ADMINISTRADOR DEL SISTEMA';
  }

  function guardAdmin() {
    const user = readStoredUser();
    const role = user?.rol || user?.Rol || '';
    if (!isAdminRole(role)) {
      window.location.href = 'dashboard.html';
      return false;
    }
    return true;
  }

  function formatDateTime(v) {
    if (!v) return '--';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleString('es-PE');
  }

  function formatErpEstado(estado) {
    const e = normalizeRole(estado);
    if (!e) return 'N/D';
    if (e === '1' || e === 'A' || e === 'ACTIVO') return 'Activo';
    if (e === '0' || e === 'I' || e === 'INACTIVO') return 'Inactivo';
    if (e === 'B' || e === 'BLOQUEADO') return 'Bloqueado';
    return estado;
  }

  function setSelectedUser(user) {
    selectedUser = user || null;
    const card = document.getElementById('erpSelectedUser');
    if (!card) return;

    if (!selectedUser) {
      card.style.display = 'none';
      return;
    }

    document.getElementById('suNombre').textContent = selectedUser.User_Fullname || '-';
    document.getElementById('suLogon').textContent = selectedUser.User_Logon || '-';
    document.getElementById('suEmail').textContent = selectedUser.User_Email || '-';
    document.getElementById('suEstado').textContent = formatErpEstado(selectedUser.User_Estado);

    card.style.display = '';
  }

  function hideSearchResults() {
    const box = document.getElementById('erpSearchResults');
    if (!box) return;
    box.style.display = 'none';
    box.innerHTML = '';
    activeSearchIndex = -1;
  }

  function showSearchMessage(message) {
    const box = document.getElementById('erpSearchResults');
    if (!box) return;
    box.innerHTML = `<div class="search-result-empty">${message}</div>`;
    box.style.display = '';
    activeSearchIndex = -1;
  }

  function pickSearchRowByIndex(index) {
    if (!Array.isArray(searchRows) || searchRows.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, searchRows.length - 1));
    const picked = searchRows[safeIndex];
    if (!picked) return;

    document.getElementById('erpUserLogon').value = picked.User_Logon || '';
    document.getElementById('erpRolApp').value = String(picked.RolApp || 'USUARIO').toUpperCase();
    document.getElementById('erpRolActivo').checked = String(picked.RolActivo || '1') === '1';
    setSelectedUser(picked);
    hideSearchResults();
  }

  function renderSearchResults() {
    const box = document.getElementById('erpSearchResults');
    if (!box) return;

    if (!Array.isArray(searchRows) || searchRows.length === 0) {
      box.innerHTML = '<div class="search-result-empty">Sin resultados para la búsqueda.</div>';
      box.style.display = '';
      return;
    }

    if (activeSearchIndex < 0 || activeSearchIndex >= searchRows.length) {
      activeSearchIndex = 0;
    }

    box.innerHTML = searchRows.map((row, idx) => {
      const logon = String(row.User_Logon || '');
      const nombre = String(row.User_Fullname || 'Sin nombre');
      const email = String(row.User_Email || 'Sin email');
      const rol = String(row.RolApp || 'USUARIO').toUpperCase();
      return `
        <div class="search-result-item ${idx === activeSearchIndex ? 'is-active' : ''}" data-logon="${logon}" data-index="${idx}">
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
        activeSearchIndex = idx;
        box.querySelectorAll('.search-result-item').forEach((x, i) => {
          x.classList.toggle('is-active', i === activeSearchIndex);
        });
      });

      item.addEventListener('mousedown', (e) => {
        // Evita perder foco antes del click en algunos navegadores.
        e.preventDefault();
      });

      item.addEventListener('click', () => {
        const idx = Number(item.getAttribute('data-index') || -1);
        if (idx >= 0) {
          pickSearchRowByIndex(idx);
          return;
        }
        const logon = item.getAttribute('data-logon') || '';
        const fallback = searchRows.find((r) => String(r.User_Logon || '') === logon);
        if (!fallback) return;
        pickSearchRowByIndex(searchRows.indexOf(fallback));
      });
    });
  }

  async function searchUsers(term) {
    const text = String(term || '').trim();
    if (text.length < 1) {
      searchRows = [];
      hideSearchResults();
      return;
    }
    showSearchMessage('Buscando...');
    const q = normalizeRole(text);
    // Filtrado local en vivo (comportamiento tipo Nueva Papeleta).
    const ranked = (Array.isArray(panelRows) ? panelRows : []).map((r) => {
      const logon = normalizeRole(r.User_Logon || '');
      const name = normalizeRole(r.User_Fullname || '');
      const email = normalizeRole(r.User_Email || '');
      const idxName = name.indexOf(q);
      const idxLogon = logon.indexOf(q);
      const idxEmail = email.indexOf(q);

      let score = -1;
      if (idxName >= 0) score = Math.min(score < 0 ? 999 : score, idxName);
      if (idxLogon >= 0) score = Math.min(score < 0 ? 999 : score, idxLogon + 100);
      if (idxEmail >= 0) score = Math.min(score < 0 ? 999 : score, idxEmail + 200);

      return { r, score };
    }).filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 20)
      .map((x) => ({
        User_Logon: x.r.User_Logon,
        User_Fullname: x.r.User_Fullname,
        User_Email: x.r.User_Email,
        User_Estado: x.r.User_Estado,
        RolApp: x.r.RolApp,
        RolActivo: x.r.RolActivo
      }));

    if (ranked.length) {
      searchRows = ranked;
      activeSearchIndex = 0;
      renderSearchResults();
    }

    // Respaldo por API para traer coincidencias fuera del set cargado en pantalla.
    // Lo activamos desde 2 caracteres para no saturar llamadas.
    if (text.length < 2) return;
    try {
      const resp = await UsuariosAPI.buscarUsuariosERP(text);
      const apiRows = Array.isArray(resp?.data) ? resp.data : [];
      if (!apiRows.length) {
        if (!ranked.length) showSearchMessage('Sin resultados para la búsqueda.');
        return;
      }

      searchRows = apiRows.slice(0, 20);
      activeSearchIndex = 0;
      renderSearchResults();
    } catch {
      if (!ranked.length) showSearchMessage('Sin resultados para la búsqueda.');
    }
  }

  function bindSearch() {
    const input = document.getElementById('erpUserLogon');
    if (!input) return;
    hideSearchResults();
    input.addEventListener('input', () => {
      currentPage = 1;
      renderPanelTable();
      if (searchTimer) clearTimeout(searchTimer);
      const term = String(input.value || '').trim();
      searchTimer = setTimeout(() => {
        searchUsers(term);
      }, 180);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        if (!searchRows.length) return;
        e.preventDefault();
        activeSearchIndex = Math.min(searchRows.length - 1, activeSearchIndex + 1);
        renderSearchResults();
        return;
      }

      if (e.key === 'ArrowUp') {
        if (!searchRows.length) return;
        e.preventDefault();
        activeSearchIndex = Math.max(0, activeSearchIndex - 1);
        renderSearchResults();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (searchRows.length && activeSearchIndex >= 0) {
          pickSearchRowByIndex(activeSearchIndex);
          return;
        }
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => hideSearchResults(), 150);
    });

    input.addEventListener('focus', () => {
      if (searchRows.length) renderSearchResults();
    });
  }

  function renderStats(stats = {}) {
    document.getElementById('stTotal').textContent = Number(stats.TotalUsuarios || 0);
    document.getElementById('stActivos').textContent = Number(stats.UsuariosERPActivos || 0);
    document.getElementById('stAdmins').textContent = Number(stats.Administradores || 0);
    document.getElementById('stStandard').textContent = Number(stats.UsuariosEstandar || 0);
  }

  function getFilteredPanelRows() {
    const input = document.getElementById('erpUserLogon');
    const q = normalizeRole(input?.value || '');
    if (!q) return Array.isArray(panelRows) ? panelRows : [];
    const tokens = q.split(' ').filter(Boolean);

    return (Array.isArray(panelRows) ? panelRows : []).filter((r) => {
      const haystack = normalizeRole([
        r.User_Logon,
        r.User_Fullname,
        r.User_Email,
        r.RolApp
      ].filter(Boolean).join(' '));
      return tokens.every((tk) => haystack.includes(tk));
    });
  }

  function getPageSlice(rows) {
    const total = Array.isArray(rows) ? rows.length : 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = total === 0 ? 0 : (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const pageRows = rows.slice(startIdx, endIdx);

    return {
      total,
      totalPages,
      startIdx,
      endIdx,
      pageRows
    };
  }

  function renderPager(total, totalPages, startIdx, endIdx) {
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

  async function runQuickAction(userLogon, accion, label) {
    const ok = confirm(`¿Desea ${label} al usuario ${userLogon}?`);
    if (!ok) return;
    try {
      const res = await UsuariosAPI.ejecutarAccionERP(userLogon, accion);
      notify(res?.message || 'Acción ejecutada');
      await loadPanel(currentSegment);
    } catch (error) {
      notify(error?.message || 'No se pudo ejecutar la acción');
    }
  }

  async function showHistory(userLogon) {
    const modal = document.getElementById('auditModal');
    const body = document.getElementById('auditBody');
    const title = document.getElementById('auditTitle');
    if (!modal || !body || !title) return;

    title.textContent = `Historial de ${userLogon}`;
    body.innerHTML = 'Cargando...';
    modal.style.display = '';

    try {
      const res = await UsuariosAPI.obtenerHistorialERP(userLogon);
      const rows = Array.isArray(res?.data) ? res.data : [];
      if (!rows.length) {
        body.innerHTML = '<div class="audit-row">Sin movimientos registrados.</div>';
        return;
      }

      body.innerHTML = rows.map((r) => `
        <div class="audit-row">
          <div><strong>${r.TipoEvento || '-'}</strong></div>
          <div>${r.Detalle || '-'}</div>
          <div class="audit-meta">${formatDateTime(r.FechaEvento)} | ${r.RealizadoPor || 'SYSTEM'}</div>
        </div>
      `).join('');
    } catch (error) {
      body.innerHTML = `<div class="audit-row">${error?.message || 'No se pudo cargar historial.'}</div>`;
    }
  }

  function renderPanelTable() {
    const body = document.getElementById('erpRolesBody');
    if (!body) return;
    body.innerHTML = '';
    const rows = getFilteredPanelRows();
    const { total, totalPages, startIdx, endIdx, pageRows } = getPageSlice(rows);
    renderPager(total, totalPages, startIdx, endIdx);

    if (!pageRows.length) {
      body.innerHTML = '<tr><td colspan="7">Sin usuarios para este filtro.</td></tr>';
      return;
    }

    for (const row of pageRows) {
      const logon = String(row.User_Logon || '');
      const nombre = String(row.User_Fullname || '-');
      const email = String(row.User_Email || '-');
      const rol = String(row.RolApp || 'USUARIO').toUpperCase();
      const estado = String(row.RolActivo || '1') === '1' ? 'Activo' : 'Bloqueado';
      const ultima = formatDateTime(row.UltimaConexion);

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
        const row = panelRows.find((r) => String(r.User_Logon || '') === logon);
        if (!row) return;
        document.getElementById('erpUserLogon').value = row.User_Logon || '';
        document.getElementById('erpRolApp').value = String(row.RolApp || 'USUARIO').toUpperCase();
        document.getElementById('erpRolActivo').checked = String(row.RolActivo || '1') === '1';
        setSelectedUser(row);
        document.getElementById('erpUserLogon').focus();
      });
    });

    body.querySelectorAll('button[data-history]').forEach((btn) => {
      btn.addEventListener('click', () => showHistory(btn.getAttribute('data-history') || ''));
    });
  }

  async function loadPanel(segment = 'all') {
    currentSegment = segment;
    const resp = await UsuariosAPI.cargarPanelERP(segment);
    renderStats(resp?.stats || {});
    panelRows = Array.isArray(resp?.data) ? resp.data : [];
    currentPage = 1;
    renderPanelTable();
  }

  async function saveErpRole(e) {
    e.preventDefault();

    const userLogonInput = String(document.getElementById('erpUserLogon')?.value || '').trim();
    const userLogon = selectedUser?.User_Logon || userLogonInput;
    const rolApp = String(document.getElementById('erpRolApp')?.value || 'USUARIO').trim().toUpperCase();
    const activo = document.getElementById('erpRolActivo')?.checked ? '1' : '0';

    if (!userLogon) {
      notify('Seleccione un usuario ERP válido.');
      return;
    }

    try {
      const res = await UsuariosAPI.guardarRolERP(userLogon, { rolApp, activo });
      notify(res?.message || 'Rol ERP actualizado correctamente');
      await loadPanel(currentSegment);
    } catch (error) {
      notify(error?.message || 'No se pudo actualizar el rol ERP');
    }
  }

  function bindTabs() {
    document.querySelectorAll('#segmentTabs .tab').forEach((btn) => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('#segmentTabs .tab').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        const segment = btn.getAttribute('data-segment') || 'all';
        await loadPanel(segment);
      });
    });
  }

  function bindPager() {
    const sel = document.getElementById('rolesPageSize');
    const bFirst = document.getElementById('rolesPgFirst');
    const bPrev = document.getElementById('rolesPgPrev');
    const bNext = document.getElementById('rolesPgNext');
    const bLast = document.getElementById('rolesPgLast');

    sel?.addEventListener('change', () => {
      pageSize = Math.max(1, Number(sel.value) || 20);
      currentPage = 1;
      renderPanelTable();
    });

    bFirst?.addEventListener('click', () => {
      currentPage = 1;
      renderPanelTable();
    });

    bPrev?.addEventListener('click', () => {
      currentPage = Math.max(1, currentPage - 1);
      renderPanelTable();
    });

    bNext?.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(getFilteredPanelRows().length / pageSize));
      currentPage = Math.min(totalPages, currentPage + 1);
      renderPanelTable();
    });

    bLast?.addEventListener('click', () => {
      currentPage = Math.max(1, Math.ceil(getFilteredPanelRows().length / pageSize));
      renderPanelTable();
    });
  }

  function exportPanelCsv() {
    if (!Array.isArray(panelRows) || panelRows.length === 0) {
      notify('No hay datos para exportar.');
      return;
    }

    const header = ['UserLogon', 'NombreCompleto', 'Email', 'Rol', 'Estado', 'UltimaConexion'];
    const lines = [header.join(',')];
    for (const r of panelRows) {
      const values = [
        r.User_Logon || '',
        r.User_Fullname || '',
        r.User_Email || '',
        r.RolApp || 'USUARIO',
        String(r.RolActivo || '1') === '1' ? 'Activo' : 'Bloqueado',
        formatDateTime(r.UltimaConexion)
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(values.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usuarios_erp_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function bindModal() {
    const modal = document.getElementById('auditModal');
    if (!modal) return;

    document.getElementById('auditClose')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    document.getElementById('auditBackdrop')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!guardAdmin()) return;

    bindSearch();
    bindTabs();
    bindPager();
    bindModal();
    document.getElementById('erpRoleForm')?.addEventListener('submit', saveErpRole);
    document.getElementById('btnRefreshPanel')?.addEventListener('click', () => loadPanel(currentSegment));
    document.getElementById('btnExportPanel')?.addEventListener('click', exportPanelCsv);

    try {
      await loadPanel('all');
    } catch (error) {
      console.error('Error cargando panel ERP:', error);
      notify('No se pudo cargar el panel de usuarios ERP');
    }
  });
})();
