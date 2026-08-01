// ==========================================
// TRABAJADORES CONTROLLER - Orquestación del módulo
// ==========================================
// Sin fetch() directo: usa TrabajadoresAPI, TrabajadoresService (lógica)
// y TrabajadoresView (render).

class TrabajadoresController {
  static trabajadores = [];
  static trabajadoresFiltrados = [];
  static actualizandoTrabajadores = false;
  static resizeTimer = null;
  static currentPage = 1;
  static pageSize = 25;
  static syncProgressTimer = null;
  static syncProgressValue = 0;

  static inicializar() {
    console.log('✅ trabajadores.controller.js cargado');
    const form = document.getElementById('form-trabajador');
    this.inicializarEventosUI(form);
    this.cargarTrabajadores();
  }

  static async cargarTrabajadores() {
    const t0 = performance.now();
    TrabajadoresView.mostrarLoadingTabla();

    try {
      const data = await TrabajadoresAPI.listarTodos();

      this.trabajadores = Array.isArray(data) ? data : [];
      this.trabajadoresFiltrados = this.trabajadores;

      TrabajadoresView.actualizarEstadisticas(this.trabajadores);
      TrabajadoresView.llenarFiltroAreas(this.trabajadores);
      this.aplicarFiltros(true);
      const syncStatus = typeof TrabajadoresAPI.estadoSincronizacion === 'function'
        ? await TrabajadoresAPI.estadoSincronizacion()
        : null;
      TrabajadoresView.actualizarSyncInfo({
        ok: syncStatus?.success !== false,
        ms: performance.now() - t0,
        ultimaSync: syncStatus?.ultimaSync || TrabajadoresService.obtenerUltimaSyncLocal(this.trabajadores),
        total: syncStatus?.total ?? this.trabajadores.length,
        activos: syncStatus?.activos ?? this.trabajadores.filter((t) => TrabajadoresService.esTrabajadorActivo(t)).length,
        inactivos: syncStatus?.inactivos ?? this.trabajadores.filter((t) => !TrabajadoresService.esTrabajadorActivo(t)).length,
        lastError: syncStatus?.lastError || null
      });

      console.log(`✅ ${this.trabajadores.length} trabajadores cargados`);
    } catch (error) {
      console.error('❌ Error al cargar trabajadores:', error);
      TrabajadoresView.mostrarErrorTabla('Error al cargar trabajadores: ' + (error?.message || 'Error desconocido'));
      TrabajadoresView.actualizarSyncInfo({ ok: false });
    }
  }

  static inicializarEventosUI(form) {
    const txtBuscar = document.getElementById('txtBuscar');
    const filtroArea = document.getElementById('filtroArea');
    const filtroEstado = document.getElementById('filtroEstado');
    const btnActualizar = document.getElementById('btnActualizarTrabajadores');
    const selPageSize = document.getElementById('twPageSize');

    if (txtBuscar) txtBuscar.addEventListener('input', () => this.aplicarFiltros(true));
    if (filtroArea) filtroArea.addEventListener('change', () => this.aplicarFiltros(true));
    if (filtroEstado) filtroEstado.addEventListener('change', () => this.aplicarFiltros(true));

    if (selPageSize) {
      selPageSize.addEventListener('change', () => {
        this.pageSize = Math.max(1, Number(selPageSize.value) || 25);
        this.currentPage = 1;
        this.aplicarFiltros(true);
      });
    }

    document.querySelectorAll('.estado-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.value || '';
        if (filtroEstado) filtroEstado.value = value;
        document.querySelectorAll('.estado-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.aplicarFiltros(true);
      });
    });

    if (btnActualizar) {
      btnActualizar.addEventListener('click', async () => {
        if (this.actualizandoTrabajadores) return;
        this.actualizandoTrabajadores = true;
        TrabajadoresView.setEstadoBotonActualizar(btnActualizar, true);
        this.iniciarProgresoSync();
        try {
          const syncResult = await TrabajadoresAPI.sincronizarCache();
          this.completarProgresoSync(syncResult);
          await this.cargarTrabajadores();
          TrabajadoresView.actualizarSyncInfo({
            ok: true,
            ms: syncResult?.durationMs ?? null,
            ultimaSync: syncResult?.ultimaSync ?? TrabajadoresService.obtenerUltimaSyncLocal(this.trabajadores),
            total: syncResult?.total ?? this.trabajadores.length,
            activos: syncResult?.activos ?? this.trabajadores.filter((t) => TrabajadoresService.esTrabajadorActivo(t)).length,
            inactivos: syncResult?.inactivos ?? this.trabajadores.filter((t) => !TrabajadoresService.esTrabajadorActivo(t)).length,
            reusedInFlightSync: !!syncResult?.reusedInFlightSync
          });
        } catch (error) {
          this.marcarErrorProgresoSync(error);
          TrabajadoresView.actualizarSyncInfo({ ok: false });
        } finally {
          this.actualizandoTrabajadores = false;
          TrabajadoresView.setEstadoBotonActualizar(btnActualizar, false);
        }
      });
    }

    const btnCancelar = document.getElementById('btnCancelarTrabajador');
    if (btnCancelar) btnCancelar.addEventListener('click', () => TrabajadoresView.mostrarModalTrabajador(false));

    window.addEventListener('resize', () => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.aplicarFiltros(), 120);
    });

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const trabajador = TrabajadoresView.leerFormulario(form);
        const errores = TrabajadoresService.validarTrabajador(trabajador);
        if (errores.length > 0) {
          alert(errores.join('\n'));
          return;
        }

        try {
          if (form.dataset.modo === 'editar' && form.dataset.id) {
            trabajador.id = form.dataset.id;
            await TrabajadoresAPI.actualizar(trabajador.id, trabajador);
            alert('Trabajador actualizado correctamente');
          } else {
            await TrabajadoresAPI.crear(trabajador);
            alert('Trabajador registrado correctamente');
          }

          form.reset();
          form.dataset.modo = 'crear';
          form.dataset.id = '';
          TrabajadoresView.mostrarModalTrabajador(false);
          await this.cargarTrabajadores();
        } catch (error) {
          alert('No se pudo guardar el trabajador: ' + (error?.message || 'Error desconocido'));
        }
      });
    }
  }

  static aplicarFiltros(resetPage = false) {
    let resultado = TrabajadoresService.filtrar(this.trabajadores, TrabajadoresView.leerFiltros());

    this.trabajadoresFiltrados = resultado;
    if (resetPage) this.currentPage = 1;

    const total = this.trabajadoresFiltrados.length;
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
    this.currentPage = Math.min(this.currentPage, totalPages);
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    const pageItems = this.trabajadoresFiltrados.slice(start, end);

    TrabajadoresView.renderizarLista(pageItems);
    TrabajadoresView.actualizarResumenLista(total, start, Math.min(end, total), this.trabajadores.length);
    TrabajadoresView.renderizarPaginacion({
      totalPages,
      currentPage: this.currentPage,
      onCambiarPagina: (pagina) => {
        this.currentPage = pagina;
        this.aplicarFiltros();
      }
    });
  }

  static editarTrabajador(t) {
    TrabajadoresView.abrirModalEdicion(t);
  }

  static async eliminarTrabajador(id) {
    if (!confirm('¿Seguro que deseas eliminar este trabajador?')) return;

    try {
      await TrabajadoresAPI.eliminar(id);
      alert('Trabajador eliminado correctamente');
      await this.cargarTrabajadores();
    } catch (error) {
      alert('No se pudo eliminar el trabajador: ' + (error?.message || 'Error desconocido'));
    }
  }

  static iniciarProgresoSync() {
    this.syncProgressValue = 8;
    TrabajadoresView.pintarProgresoSync(this.syncProgressValue);
    TrabajadoresView.mostrarProgresoSyncInicio();

    if (this.syncProgressTimer) clearInterval(this.syncProgressTimer);
    this.syncProgressTimer = setInterval(() => {
      if (this.syncProgressValue >= 92) return;
      const incremento = this.syncProgressValue < 45 ? 7 : this.syncProgressValue < 75 ? 4 : 1;
      this.syncProgressValue = Math.min(92, this.syncProgressValue + incremento);
      TrabajadoresView.pintarProgresoSync(this.syncProgressValue);
    }, 320);
  }

  static completarProgresoSync(result) {
    if (this.syncProgressTimer) {
      clearInterval(this.syncProgressTimer);
      this.syncProgressTimer = null;
    }
    TrabajadoresView.mostrarProgresoSyncCompletado(result);
  }

  static marcarErrorProgresoSync(error) {
    if (this.syncProgressTimer) {
      clearInterval(this.syncProgressTimer);
      this.syncProgressTimer = null;
    }
    TrabajadoresView.mostrarProgresoSyncError(error, Math.max(this.syncProgressValue, 100));
  }
}

window.TrabajadoresController = TrabajadoresController;
console.log("TrabajadoresController loaded + exposed");
