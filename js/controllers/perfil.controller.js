(function () {
  let currentEmail = '';
  let roleRows = [];

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
  
  function getAppBaseUrl() {
    try {
      const apiUrl = (typeof API_CONFIG !== 'undefined' && API_CONFIG.baseURL) || '';
      if (!apiUrl) return window.location.origin;

      const url = new URL(apiUrl);
      
      let path = url.pathname;
      if (path.endsWith('/api')) {
        path = path.slice(0, -4);
      } else if (path.endsWith('/api/')) {
        path = path.slice(0, -5);
      }
      
      const baseUrl = `${url.origin}${path}`.replace(/\/$/, '');
      
      return baseUrl;
    } catch {
      return window.location.origin;
    }
  }
  function normalizePhotoUrl(url) {
    if (!url) return '../img/logo-gp.png';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const baseUrl = getAppBaseUrl();
    return `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  }

  function updateStoredUser(patch) {
    const raw = localStorage.getItem('usuario');
    if (!raw || raw === 'undefined' || raw === 'null') return;
    try {
      const u = JSON.parse(raw);
      const next = { ...u, ...patch };
      localStorage.setItem('usuario', JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('gp:user-updated'));
    } catch {}
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

  function applyProfileToForm(p = {}) {
    document.getElementById('perfilUsuario').value = p.usuario || '';
    document.getElementById('perfilNombre').value = p.nombre || '';
    document.getElementById('perfilEmail').value = p.email || '';
    const role = normalizeRole(p.rol || '') === 'USUARIO_ERP' ? 'USUARIO' : (p.rol || '');
    document.getElementById('perfilRol').value = role;
    document.getElementById('profilePhoto').src = normalizePhotoUrl(p.fotoUrl);
  }

  function renderRolesTable() {
    const body = document.getElementById('erpRolesBody');
    if (!body) return;
    body.innerHTML = '';

    if (!Array.isArray(roleRows) || roleRows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6">Sin roles registrados.</td>';
      body.appendChild(tr);
      return;
    }

    for (const row of roleRows) {
      const tr = document.createElement('tr');
      const userLogon = String(row.UserLogon || '');
      const rolApp = String(row.RolApp || 'USUARIO').toUpperCase();
      const activo = String(row.Activo || '1') === '1' ? 'SI' : 'NO';
      const fecha = row.FechaActualizacion ? new Date(row.FechaActualizacion).toLocaleString() : '';
      const actualizadoPor = row.ActualizadoPor || '';

      tr.innerHTML = `
        <td>${userLogon}</td>
        <td>${rolApp}</td>
        <td>${activo}</td>
        <td>${fecha}</td>
        <td>${actualizadoPor}</td>
        <td><button type="button" class="roles-btn-mini" data-edit="${userLogon}">Editar</button></td>
      `;

      body.appendChild(tr);
    }

    body.querySelectorAll('button[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userLogon = btn.getAttribute('data-edit') || '';
        const row = roleRows.find((r) => String(r.UserLogon || '') === userLogon);
        if (!row) return;

        document.getElementById('erpUserLogon').value = row.UserLogon || '';
        document.getElementById('erpRolApp').value = String(row.RolApp || 'USUARIO').toUpperCase();
        document.getElementById('erpRolActivo').checked = String(row.Activo || '1') === '1';
        document.getElementById('erpUserLogon').focus();
      });
    });
  }

  async function loadErpRoles() {
    const roleCard = document.getElementById('adminRolesCard');
    if (!roleCard) return;

    const local = readStoredUser();
    const myRole = local?.rol || local?.Rol || '';
    if (!isAdminRole(myRole)) {
      roleCard.style.display = 'none';
      return;
    }

    roleCard.style.display = '';

    try {
      const resp = await UsuariosAPI.listarRolesERP();
      roleRows = Array.isArray(resp?.data) ? resp.data : [];
      renderRolesTable();
    } catch (error) {
      roleRows = [];
      renderRolesTable();
      console.warn('No se pudieron cargar roles ERP:', error?.message || error);
    }
  }

  async function loadProfile() {
    try {
      const data = await UsuariosAPI.obtenerPerfil();
      if (!data?.success || !data?.perfil) throw new Error('Perfil no disponible');

      const p = data.perfil;
      currentEmail = p.email || '';
      applyProfileToForm(p);

      updateStoredUser({
        usuario: p.usuario || '',
        nombre: p.nombre || '',
        email: p.email || '',
        rol: normalizeRole(p.rol || '') === 'USUARIO_ERP' ? 'USUARIO' : (p.rol || ''),
        fotoUrl: p.fotoUrl || ''
      });
    } catch (error) {
      const local = readStoredUser();
      if (local) {
        currentEmail = local.email || '';
        applyProfileToForm({
          usuario: local.usuario || local.Usuario || '',
          nombre: local.nombre || local.NombreCompleto || '',
          email: local.email || local.Email || '',
          rol: local.rol || local.Rol || 'USUARIO',
          fotoUrl: local.fotoUrl || local.FotoUrl || ''
        });
      }
      console.warn('No se pudo cargar perfil desde API, usando datos locales:', error?.message || error);
    }

    await loadErpRoles();
  }

  async function saveProfile(e) {
    e.preventDefault();
    const nombreCompleto = document.getElementById('perfilNombre').value.trim();

    const res = await UsuariosAPI.actualizarPerfil({
      nombreCompleto,
      email: currentEmail
    });

    if (res?.success) {
      notify('Nombre actualizado correctamente');
      await loadProfile();
    }
  }

  async function uploadPhoto() {
    const input = document.getElementById('photoInput');
    const file = input.files && input.files[0];
    if (!file) return notify('Seleccione una imagen');
    if (file.size > 2 * 1024 * 1024) return notify('La imagen supera 2MB');

    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

    const res = await UsuariosAPI.actualizarFoto(base64);
    if (res?.success) {
      document.getElementById('profilePhoto').src = normalizePhotoUrl(res.fotoUrl);
      updateStoredUser({ fotoUrl: res.fotoUrl || '' });
      notify('Foto actualizada');
      await loadProfile();
    }
  }

  async function saveErpRole(e) {
    e.preventDefault();

    const userLogon = String(document.getElementById('erpUserLogon')?.value || '').trim();
    const rolApp = String(document.getElementById('erpRolApp')?.value || 'USUARIO').trim().toUpperCase();
    const activo = document.getElementById('erpRolActivo')?.checked ? '1' : '0';

    if (!userLogon) {
      notify('Ingrese el usuario ERP (UserLogon).');
      return;
    }

    try {
      const res = await UsuariosAPI.guardarRolERP(userLogon, { rolApp, activo });
      notify(res?.message || 'Rol ERP actualizado correctamente');
      await loadErpRoles();
    } catch (error) {
      notify(error?.message || 'No se pudo actualizar el rol ERP');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('profileForm')?.addEventListener('submit', saveProfile);
    document.getElementById('btnUploadPhoto')?.addEventListener('click', uploadPhoto);
    document.getElementById('erpRoleForm')?.addEventListener('submit', saveErpRole);
    await loadProfile();
  });
})();
