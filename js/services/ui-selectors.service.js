const UISelectorService = {
  cacheTtlMs: 12 * 60 * 60 * 1000, // 12 horas

  _getCache(key, tsKey) {
    try {
      const ts = Number(localStorage.getItem(tsKey) || 0);
      if (!ts || (Date.now() - ts) > this.cacheTtlMs) return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : null;
    } catch {
      return null;
    }
  },

  _setCache(key, tsKey, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data || []));
      localStorage.setItem(tsKey, String(Date.now()));
    } catch {}
  },

  async cargarAreas(selectorId) {
    const el = document.getElementById(selectorId);
    if (!el) return;

    // Si no es SELECT, saltar
    if (el.tagName !== 'SELECT') {
      console.warn(`⚠️ El elemento ${selectorId} no es un <select>. Saltando carga.`);
      return;
    }

    try {
      if (typeof CatalogosAPI === "undefined") {
        console.error("❌ CatalogosAPI no está definido. Asegura cargar catalogos.api.js antes.");
        return;
      }

      const cacheKey = 'catalog_areas_v2';
      const tsKey = 'catalog_areas_ts_v2';
      let areas = this._getCache(cacheKey, tsKey);
      if (!areas) {
        areas = await CatalogosAPI.areas();
        this._setCache(cacheKey, tsKey, areas);
      }

      // Guardar opción por defecto si existe
      const defaultOption = el.options && el.options.length > 0 ? el.options[0].cloneNode(true) : null;

      // Limpiar y reinsertar default
      el.innerHTML = "";
      if (defaultOption) el.add(defaultOption);

      (areas || []).forEach(area => {
        const nombre = area?.NombreArea || area?.Area || area;
        if (!nombre) return;
        el.add(new Option(nombre, nombre));
      });

      console.log(`✅ Selector ${selectorId} cargado.`);
    } catch (error) {
      console.error(`❌ Error en cargarAreas (${selectorId}):`, error);
    }
  },

  async cargarTiposPermiso(selectorId) {
    const el = document.getElementById(selectorId);
    if (!el) return;

    if (el.tagName !== 'SELECT') {
      console.warn(`⚠️ El elemento ${selectorId} no es un <select>. Saltando carga.`);
      return;
    }

    // Este selector queda fijo por requerimiento funcional del formulario.
    if (selectorId === 'considerar') {
      const defaultOption = el.options && el.options.length > 0 ? el.options[0].cloneNode(true) : new Option("Seleccione...", "");
      el.innerHTML = "";
      el.add(defaultOption);
      ["1/2 dia a cuenta de vacaciones", "Comisión", "Compensacion", "Otros"].forEach((valor) => {
        el.add(new Option(valor, valor));
      });
      console.log(`✅ Tipos permiso fijos cargados en ${selectorId}.`);
      return;
    }

    try {
      if (typeof CatalogosAPI === "undefined") {
        console.error("❌ CatalogosAPI no está definido. Asegura cargar catalogos.api.js antes.");
        return;
      }

      const cacheKey = 'catalog_tipos_permiso_v1';
      const tsKey = 'catalog_tipos_permiso_ts_v1';
      let tipos = this._getCache(cacheKey, tsKey);
      if (!tipos) {
        tipos = await CatalogosAPI.tiposPermiso();
        this._setCache(cacheKey, tsKey, tipos);
      }

      const defaultOption = el.options && el.options.length > 0 ? el.options[0].cloneNode(true) : null;

      el.innerHTML = "";
      if (defaultOption) el.add(defaultOption);

      const normalize = (v) => String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();

      const placeholders = new Set([
        "seleccione",
        "seleccione...",
        "usar plantilla descriptiva (opcional)"
      ]);

      const existentes = new Set([...el.options].map(o => normalize(o.value || o.textContent)));

      (tipos || []).forEach(tipo => {
        const nombre = String(tipo?.NombreTipo || tipo || "").trim();
        if (!nombre) return;
        const n = normalize(nombre);
        if (!n || placeholders.has(n)) return;
        if (existentes.has(n)) return;
        el.add(new Option(nombre, nombre));
        existentes.add(n);
      });

      console.log(`✅ Tipos permiso cargados en ${selectorId}.`);
    } catch (error) {
      console.error(`❌ Error en cargarTiposPermiso (${selectorId}):`, error);
    }
  }
};

// ✅ IMPORTANTE: exponer a window para que el controller lo encuentre
window.UISelectorService = UISelectorService;

console.log('✅ UISelectorService loaded + exposed:', window.UISelectorService);
