(function () {
  const body = document.body;
  const html = document.documentElement;

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const sbBrand = document.querySelector('.sb-brand');

  const hamburger = document.getElementById('hamburger');
  const sbClose = document.getElementById('sbClose') || document.getElementById('toggleBtn');
  const DESKTOP_BREAKPOINT = 901;
  const SB_COLLAPSED_KEY = 'sb_collapsed_v2';

  function openSb() { body.classList.add('sb-open'); }
  function closeSb() { body.classList.remove('sb-open'); }
  function toggleSb() { body.classList.toggle('sb-open'); }
  function isDesktop() { return window.innerWidth >= DESKTOP_BREAKPOINT; }
  function applyDesktopCollapsedState() {
    if (!isDesktop()) {
      body.classList.remove('sb-collapsed');
      return;
    }
    const saved = localStorage.getItem(SB_COLLAPSED_KEY) === '1';
    body.classList.toggle('sb-collapsed', saved);
  }

  function toggleDesktopCollapse() {
    const next = !body.classList.contains('sb-collapsed');
    body.classList.toggle('sb-collapsed', next);
    localStorage.setItem(SB_COLLAPSED_KEY, next ? '1' : '0');
  }

  hamburger?.addEventListener('click', (e) => {
    e.preventDefault();
    if (isDesktop()) {
      toggleDesktopCollapse();
      return;
    }
    toggleSb();
  });

  sbBrand?.addEventListener('click', (e) => {
    if (!isDesktop()) return;
    e.preventDefault();
    toggleDesktopCollapse();
  });

  sbClose?.addEventListener('click', (e) => {
    e.preventDefault();
    closeSb();
  });

  // Cerrar sidebar automáticamente al elegir una opción del menú.
  document.querySelectorAll('.sb-menu .sb-item').forEach((item) => {
    item.addEventListener('click', () => {
      if (!isDesktop()) {
        closeSb();
        return;
      }

      // En desktop: auto-colapsar al navegar y persistir preferencia.
      body.classList.add('sb-collapsed');
      localStorage.setItem(SB_COLLAPSED_KEY, '1');
    });
  });

  overlay?.addEventListener('click', closeSb);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSb();
  });
  window.addEventListener('resize', applyDesktopCollapsedState);
  applyDesktopCollapsedState();

  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('theme') || 'light';
  const applyTheme = (isDark) => {
    body.classList.toggle('dark', isDark);
    html.classList.toggle('dark', isDark);
    if (themeToggle) themeToggle.checked = isDark;
  };

  applyTheme(savedTheme === 'dark');

  themeToggle?.addEventListener('change', () => {
    const isDark = !!themeToggle.checked;
    applyTheme(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  function normalizeRole(role) {
    return String(role || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function canAccessTrabajadores(role) {
    const r = normalizeRole(role);
    const allowed = new Set([
      'ADMIN',
      'ADMINISTRADOR',
      'ADMINISTRADOR DEL SISTEMA',
      'RRHH',
      'RR HH',
      'RECURSOS HUMANOS'
    ]);
    return allowed.has(r);
  }

  function canAccessAdministrar(role) {
    const r = normalizeRole(role);
    const allowed = new Set([
      'ADMIN',
      'ADMINISTRADOR',
      'ADMINISTRADOR DEL SISTEMA'
    ]);
    return allowed.has(r);
  }

  function applyTrabajadoresVisibility(role) {
    if (canAccessTrabajadores(role)) return;

    const item = document.getElementById('mTrabajadores');
    if (item) item.style.display = 'none';

    document.querySelectorAll('a[href="trabajadores.html"], a[href="/trabajadores"]').forEach(a => {
      a.style.display = 'none';
    });
  }

  function hideReportes() {
    const item = document.getElementById('mReportes');
    if (item) item.style.display = 'none';

    document.querySelectorAll('a[href="reporte.html"], a[href="/reportes"]').forEach(a => {
      a.style.display = 'none';
    });
  }

  function applyAdministrarVisibility(role) {
    if (canAccessAdministrar(role)) return;

    const item = document.getElementById('mAdministrar');
    if (item) item.style.display = 'none';

    document.querySelectorAll('a[href="administrar.html"], a[href="/administrar"]').forEach(a => {
      a.style.display = 'none';
    });
  }

  function hideDisabledMenuItems() {
    const ids = ['mNueva'];
    ids.forEach((id) => {
      const item = document.getElementById(id);
      if (item) item.style.display = 'none';
    });

    // Solo ocultar enlaces de menú deshabilitados
    document.querySelectorAll('a.sb-item[href="formulario-papeleta.html"], a.sb-item[href="/nueva-papeleta"]').forEach((a) => {
      a.style.display = 'none';
    });
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
    if (!url) return ''; // No fallback image for sidebar, just icon
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const baseUrl = getAppBaseUrl();
    return `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  }

  function renderSidebarAvatar(photoUrl) {
    const avatar = document.querySelector('.sb-avatar');
    if (!avatar) return;

    const src = normalizePhotoUrl(photoUrl);
    if (!src) {
      avatar.innerHTML = '<i class="fa-solid fa-user"></i>';
      return;
    }

    avatar.innerHTML = `<img class="sb-avatar-img" src="${src}" alt="Foto de usuario" onerror="this.parentElement.innerHTML='<i class=&quot;fa-solid fa-user&quot;></i>'">`;
  }

  function readStoredUser() {
    const raw = localStorage.getItem('usuario');
    if (!raw || raw === 'undefined' || raw === 'null') {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function applyUserToSidebar(u) {
    if (!u || typeof u !== 'object') {
      hideDisabledMenuItems();
      applyAdministrarVisibility('');
      hideReportes();
      return;
    }

    const name = u.nombre || u.NombreCompleto || 'Usuario';
    const rawRole = u.rol || u.Rol || 'ROL';
    const role = String(rawRole).toUpperCase() === 'USUARIO_ERP' ? 'USUARIO' : rawRole;
    const photoUrl = u.fotoUrl || u.FotoUrl || u.photoUrl || '';
    hideDisabledMenuItems();
    applyTrabajadoresVisibility(role);
    applyAdministrarVisibility(role);
    hideReportes();
    renderSidebarAvatar(photoUrl);
    if (document.getElementById('sbUserName')) document.getElementById('sbUserName').textContent = name;
    if (document.getElementById('sbUserRole')) document.getElementById('sbUserRole').textContent = role;
  }

  function refreshSidebarUser() {
    const user = readStoredUser();
    applyUserToSidebar(user);
  }

  (function loadUser() {
    refreshSidebarUser();
  })();

  // Refresco inmediato cuando perfil actualiza datos en la misma pestaña.
  window.addEventListener('gp:user-updated', refreshSidebarUser);
  // Refresco cuando cambia localStorage desde otra pestaña.
  window.addEventListener('storage', (event) => {
    if (event.key === 'usuario') refreshSidebarUser();
  });

  function doLogout() {
    if (!confirm('¿Está seguro que desea cerrar sesión?')) return;
    localStorage.removeItem('usuario');
    localStorage.removeItem('token');
    window.location.href = '/';
  }

  document.getElementById('btnSidebarLogout')?.addEventListener('click', (e) => {
    e.preventDefault();
    doLogout();
  });

  document.getElementById('btnLogout')?.addEventListener('click', (e) => {
    e.preventDefault();
    doLogout();
  });

  const file = (location.pathname.split('/').pop() || '').toLowerCase();
  const route = (location.pathname || '').toLowerCase();
  const map = {
    'dashboard.html': 'mDashboard',
    'formulario-papeleta.html': 'mNueva',
    'permisos.html': 'mPermisos',
    'trabajadores.html': 'mTrabajadores',
    'administrar.html': 'mAdministrar',
    'perfil.html': 'mPerfil',
    'dashboard': 'mDashboard',
    'nueva-papeleta': 'mNueva',
    'papeletas': 'mPermisos',
    'permisos': 'mPermisos',
    'trabajadores': 'mTrabajadores',
    'administrar': 'mAdministrar',
    'perfil': 'mPerfil'
  };

  hideDisabledMenuItems();
  hideReportes();

  const activeId = map[file] || map[route.replace(/^\//, '')];
  if (activeId) document.getElementById(activeId)?.classList.add('active');
})();
