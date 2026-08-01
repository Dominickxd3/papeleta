// ==========================================
// USUARIOS CONTROLLER - Orquestación del módulo
// ==========================================
// Eventos + coordinación. Sin fetch() directo: usa UsuariosAPI
// (via UsuariosService) y UsuariosView (render). El guard de rol
// vive en pages/usuarios.page.js.

class UsuariosController {
  static searchRows = [];
  static selectedUser = null;
  static searchTimer = null;
  static activeSearchIndex = -1;
  static currentSegment = 'all';
  static panelRows = [];
  static currentPage = 1;
  static pageSize = 20;

  static notify(msg) {
    alert(msg);
  }

  static inicializar() {
    this.bindSearch();
    this.bindTabs();
    this.bindPager();
    this.bindModal();
    document.getElementById('erpRoleForm')?.addEventListener('submit', (e) => this.saveErpRole(e));
    document.getElementById('btnRefreshPanel')?.addEventListener('click', () => this.loadPanel(this.currentSegment));
    document.getElementById('btnExportPanel')?.addEventListener('click', () => this.exportPanelCsv());

    return this.loadPanel('all').catch((error) => {
      console.error('Error cargando panel ERP:', error);
      this.notify('No se pudo cargar el panel de usuarios ERP');
    });
  }

  static bindSearch() {
    const input = document.getElementById('erpUserLogon');
    if (!input) return;
    UsuariosView.hideSearchResults();

    input.addEventListener('input', () => {
      this.currentPage = 1;
      this.renderPanelTable();
      if (this.searchTimer) clearTimeout(this.searchTimer);
      const term = String(input.value || '').trim();
      this.searchTimer = setTimeout(() => {
        this.onSearch(term);
      }, 180);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        if (!this.searchRows.length) return;
        e.preventDefault();
        this.activeSearchIndex = Math.min(this.searchRows.length - 1, this.activeSearchIndex + 1);
        this.renderSearchResults();
        return;
      }

      if (e.key === 'ArrowUp') {
        if (!this.searchRows.length) return;
        e.preventDefault();
        this.activeSearchIndex = Math.max(0, this.activeSearchIndex - 1);
        this.renderSearchResults();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.searchRows.length && this.activeSearchIndex >= 0) {
          this.pickSearchRowByIndex(this.activeSearchIndex);
          return;
        }
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => UsuariosView.hideSearchResults(), 150);
    });

    input.addEventListener('focus', () => {
      if (this.searchRows.length) this.renderSearchResults();
    });
  }

  static async onSearch(term) {
    const text = String(term || '').trim();
    if (text.length < 1) {
      this.searchRows = [];
      UsuariosView.hideSearchResults();
      return;
    }

    UsuariosView.showSearchMessage('Buscando...');
    const res = await UsuariosService.buscar(text, this.panelRows);

    if (res.kind === 'none') {
      this.searchRows = [];
      UsuariosView.hideSearchResults();
      return;
    }

    if (res.kind === 'local') {
      if (res.rows.length) {
        this.searchRows = res.rows;
        this.activeSearchIndex = 0;
        this.renderSearchResults();
      }
      return;
    }

    if (res.kind === 'api') {
      this.searchRows = res.rows;
      this.activeSearchIndex = 0;
      this.renderSearchResults();
      return;
    }

    UsuariosView.showSearchMessage('Sin resultados para la búsqueda.');
  }

  static renderSearchResults() {
    const safe = UsuariosView.renderSearchResults({
      rows: this.searchRows,
      activeIndex: this.activeSearchIndex,
      onPick: (sel) => this.pickSearchRow(sel),
      onRerender: (idx) => {
        this.activeSearchIndex = idx;
        this.renderSearchResults();
      }
    });
    this.activeSearchIndex = safe;
  }

  static pickSearchRow(sel) {
    if (typeof sel === 'number') {
      this.pickSearchRowByIndex(sel);
      return;
    }
    const logon = String(sel || '');
    const fallback = this.searchRows.find((r) => String(r.User_Logon || '') === logon);
    if (!fallback) return;
    this.pickSearchRowByIndex(this.searchRows.indexOf(fallback));
  }

  static pickSearchRowByIndex(index) {
    if (!Array.isArray(this.searchRows) || this.searchRows.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, this.searchRows.length - 1));
    const picked = this.searchRows[safeIndex];
    if (!picked) return;

    document.getElementById('erpUserLogon').value = picked.User_Logon || '';
    document.getElementById('erpRolApp').value = String(picked.RolApp || 'USUARIO').toUpperCase();
    document.getElementById('erpRolActivo').checked = String(picked.RolActivo || '1') === '1';
    UsuariosView.setSelectedUser(picked);
    UsuariosView.hideSearchResults();
  }

  static bindTabs() {
    document.querySelectorAll('#segmentTabs .tab').forEach((btn) => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('#segmentTabs .tab').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        const segment = btn.getAttribute('data-segment') || 'all';
        await this.loadPanel(segment);
      });
    });
  }

  static bindPager() {
    const sel = document.getElementById('rolesPageSize');
    const bFirst = document.getElementById('rolesPgFirst');
    const bPrev = document.getElementById('rolesPgPrev');
    const bNext = document.getElementById('rolesPgNext');
    const bLast = document.getElementById('rolesPgLast');

    sel?.addEventListener('change', () => {
      this.pageSize = Math.max(1, Number(sel.value) || 20);
      this.currentPage = 1;
      this.renderPanelTable();
    });

    bFirst?.addEventListener('click', () => {
      this.currentPage = 1;
      this.renderPanelTable();
    });

    bPrev?.addEventListener('click', () => {
      this.currentPage = Math.max(1, this.currentPage - 1);
      this.renderPanelTable();
    });

    bNext?.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(this.getFilteredPanelRows().length / this.pageSize));
      this.currentPage = Math.min(totalPages, this.currentPage + 1);
      this.renderPanelTable();
    });

    bLast?.addEventListener('click', () => {
      this.currentPage = Math.max(1, Math.ceil(this.getFilteredPanelRows().length / this.pageSize));
      this.renderPanelTable();
    });
  }

  static bindModal() {
    const modal = document.getElementById('auditModal');
    if (!modal) return;

    document.getElementById('auditClose')?.addEventListener('click', () => UsuariosView.closeHistorial());
    document.getElementById('auditBackdrop')?.addEventListener('click', () => UsuariosView.closeHistorial());
  }

  static getFilteredPanelRows() {
    const input = document.getElementById('erpUserLogon');
    return UsuariosService.filtrarPanelRows(this.panelRows, input?.value || '');
  }

  static renderPanelTable() {
    const rows = this.getFilteredPanelRows();
    const pager = UsuariosService.paginar(rows, this.currentPage, this.pageSize);
    this.currentPage = pager.currentPage;

    UsuariosView.renderPager(pager);
    UsuariosView.renderPanelTable(pager.pageRows, {
      onEdit: (logon) => this.editFromPanel(logon),
      onHistory: (logon) => this.showHistory(logon)
    });
  }

  static editFromPanel(logon) {
    const row = this.panelRows.find((r) => String(r.User_Logon || '') === logon);
    if (!row) return;

    document.getElementById('erpUserLogon').value = row.User_Logon || '';
    document.getElementById('erpRolApp').value = String(row.RolApp || 'USUARIO').toUpperCase();
    document.getElementById('erpRolActivo').checked = String(row.RolActivo || '1') === '1';
    UsuariosView.setSelectedUser(row);
    document.getElementById('erpUserLogon').focus();
  }

  static async loadPanel(segment = 'all') {
    this.currentSegment = segment;
    const resp = await UsuariosService.cargarPanel(segment);
    UsuariosView.renderStats(resp?.stats || {});
    this.panelRows = Array.isArray(resp?.data) ? resp.data : [];
    this.currentPage = 1;
    this.renderPanelTable();
  }

  static async saveErpRole(e) {
    e.preventDefault();

    const userLogonInput = String(document.getElementById('erpUserLogon')?.value || '').trim();
    const userLogon = this.selectedUser?.User_Logon || userLogonInput;
    const rolApp = String(document.getElementById('erpRolApp')?.value || 'USUARIO').trim().toUpperCase();
    const activo = document.getElementById('erpRolActivo')?.checked ? '1' : '0';

    if (!userLogon) {
      this.notify('Seleccione un usuario ERP válido.');
      return;
    }

    try {
      const res = await UsuariosService.guardarRol(userLogon, { rolApp, activo });
      this.notify(res?.message || 'Rol ERP actualizado correctamente');
      await this.loadPanel(this.currentSegment);
    } catch (error) {
      this.notify(error?.message || 'No se pudo actualizar el rol ERP');
    }
  }

  static async showHistory(userLogon) {
    UsuariosView.openHistorial(userLogon);

    try {
      const res = await UsuariosService.obtenerHistorial(userLogon);
      UsuariosView.renderHistorial(Array.isArray(res?.data) ? res.data : []);
    } catch (error) {
      UsuariosView.renderHistorialError(error?.message || 'No se pudo cargar historial.');
    }
  }

  static async runQuickAction(userLogon, accion, label) {
    const ok = confirm(`¿Desea ${label} al usuario ${userLogon}?`);
    if (!ok) return;

    try {
      const res = await UsuariosService.ejecutarAccion(userLogon, accion);
      this.notify(res?.message || 'Acción ejecutada');
      await this.loadPanel(this.currentSegment);
    } catch (error) {
      this.notify(error?.message || 'No se pudo ejecutar la acción');
    }
  }

  static exportPanelCsv() {
    if (!Array.isArray(this.panelRows) || this.panelRows.length === 0) {
      this.notify('No hay datos para exportar.');
      return;
    }

    const header = ['UserLogon', 'NombreCompleto', 'Email', 'Rol', 'Estado', 'UltimaConexion'];
    const lines = [header.join(',')];
    for (const r of this.panelRows) {
      const values = [
        r.User_Logon || '',
        r.User_Fullname || '',
        r.User_Email || '',
        r.RolApp || 'USUARIO',
        String(r.RolActivo || '1') === '1' ? 'Activo' : 'Bloqueado',
        UsuariosFormatters.formatDateTime(r.UltimaConexion)
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
}

window.UsuariosController = UsuariosController;
console.log('✅ UsuariosController loaded');
