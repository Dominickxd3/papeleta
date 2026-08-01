// ==========================================
// USUARIOS SERVICE - Comunicación con backend y lógica pura
// ==========================================
// Sin DOM: no usa document.querySelector ni manipula HTML.
// Depende de UsuariosAPI (fetch) y UsuariosFormatters.

class UsuariosService {
  static async cargarPanel(segment = 'all') {
    return UsuariosAPI.cargarPanelERP(segment);
  }

  static async guardarRol(userLogon, payload) {
    return UsuariosAPI.guardarRolERP(userLogon, payload);
  }

  static async ejecutarAccion(userLogon, accion) {
    return UsuariosAPI.ejecutarAccionERP(userLogon, accion);
  }

  static async obtenerHistorial(userLogon) {
    return UsuariosAPI.obtenerHistorialERP(userLogon);
  }

  static rankLocal(panelRows, query) {
    const q = UsuariosFormatters.normalizeRole(query);
    return (Array.isArray(panelRows) ? panelRows : [])
      .map((r) => {
        const logon = UsuariosFormatters.normalizeRole(r.User_Logon || '');
        const name = UsuariosFormatters.normalizeRole(r.User_Fullname || '');
        const email = UsuariosFormatters.normalizeRole(r.User_Email || '');
        const idxName = name.indexOf(q);
        const idxLogon = logon.indexOf(q);
        const idxEmail = email.indexOf(q);

        let score = -1;
        if (idxName >= 0) score = Math.min(score < 0 ? 999 : score, idxName);
        if (idxLogon >= 0) score = Math.min(score < 0 ? 999 : score, idxLogon + 100);
        if (idxEmail >= 0) score = Math.min(score < 0 ? 999 : score, idxEmail + 200);

        return { r, score };
      })
      .filter((x) => x.score >= 0)
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
  }

  static async buscar(term, panelRows) {
    const text = String(term || '').trim();
    if (text.length < 1) return { kind: 'none', rows: [] };

    const q = UsuariosFormatters.normalizeRole(text);
    const ranked = this.rankLocal(panelRows, q);

    if (text.length < 2) return { kind: 'local', rows: ranked };

    try {
      const resp = await UsuariosAPI.buscarUsuariosERP(text);
      const apiRows = Array.isArray(resp?.data) ? resp.data.slice(0, 20) : [];
      if (apiRows.length) return { kind: 'api', rows: apiRows };
      return ranked.length ? { kind: 'local', rows: ranked } : { kind: 'empty', rows: [] };
    } catch {
      return ranked.length ? { kind: 'local', rows: ranked } : { kind: 'empty', rows: [] };
    }
  }

  static filtrarPanelRows(rows, query) {
    const q = UsuariosFormatters.normalizeRole(query || '');
    if (!q) return Array.isArray(rows) ? rows : [];
    const tokens = q.split(' ').filter(Boolean);

    return (Array.isArray(rows) ? rows : []).filter((r) => {
      const haystack = UsuariosFormatters.normalizeRole([
        r.User_Logon,
        r.User_Fullname,
        r.User_Email,
        r.RolApp
      ].filter(Boolean).join(' '));
      return tokens.every((tk) => haystack.includes(tk));
    });
  }

  static paginar(rows, currentPage, pageSize) {
    const total = Array.isArray(rows) ? rows.length : 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    let page = currentPage;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    const startIdx = total === 0 ? 0 : (page - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const pageRows = rows.slice(startIdx, endIdx);

    return { total, totalPages, currentPage: page, startIdx, endIdx, pageRows };
  }
}

window.UsuariosService = UsuariosService;
console.log('✅ UsuariosService loaded');
