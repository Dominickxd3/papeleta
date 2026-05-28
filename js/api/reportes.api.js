
const ReportesAPI = {
  
  async reporteGeneral(filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.area) params.append('area', filtros.area);
      if (filtros.estado) params.append('estado', filtros.estado);
      
      const response = await apiClient.get(`/reportes/general?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener reporte general:', error);
      throw error;
    }
  },

  
  async reportePorTrabajador(idTrabajador, filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      
      const response = await apiClient.get(`/reportes/trabajador/${idTrabajador}?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener reporte por trabajador:', error);
      throw error;
    }
  },

 
  async reportePorArea(area, filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.estado) params.append('estado', filtros.estado);
      
      const response = await apiClient.get(`/reportes/area/${encodeURIComponent(area)}?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener reporte por área:', error);
      throw error;
    }
  },

  
  async reporteAsistencia(filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.area) params.append('area', filtros.area);
      
      const response = await apiClient.get(`/reportes/asistencia?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener reporte de asistencia:', error);
      throw error;
    }
  },


  async reporteHorasAcumuladas(filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.area) params.append('area', filtros.area);
      if (filtros.idTrabajador) params.append('idTrabajador', filtros.idTrabajador);
      
      const response = await apiClient.get(`/reportes/horas-acumuladas?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener reporte de horas:', error);
      throw error;
    }
  },

  async reportePorTipo(filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.area) params.append('area', filtros.area);
      
      const response = await apiClient.get(`/reportes/por-tipo?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener reporte por tipo:', error);
      throw error;
    }
  },


  async reporteTendencias(filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.agrupacion) params.append('agrupacion', filtros.agrupacion); // 'dia', 'semana', 'mes'
      
      const response = await apiClient.get(`/reportes/tendencias?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener reporte de tendencias:', error);
      throw error;
    }
  },


  async estadisticasDashboard(filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      
      const response = await apiClient.get(`/reportes/dashboard?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener estadísticas del dashboard:', error);
      throw error;
    }
  },

  async reporteAusentismo(filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.area) params.append('area', filtros.area);
      
      const response = await apiClient.get(`/reportes/ausentismo?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener reporte de ausentismo:', error);
      throw error;
    }
  },


  async exportarPDF(tipoReporte, filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.area) params.append('area', filtros.area);
      if (filtros.estado) params.append('estado', filtros.estado);
      
      const response = await fetch(`${apiClient.baseURL}/reportes/${tipoReporte}/pdf?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Error al exportar PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-${tipoReporte}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return true;
    } catch (error) {
      console.error('Error al exportar PDF:', error);
      throw error;
    }
  },

  
  async exportarExcel(tipoReporte, filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.area) params.append('area', filtros.area);
      if (filtros.estado) params.append('estado', filtros.estado);
      
      const response = await fetch(`${apiClient.baseURL}/reportes/${tipoReporte}/excel?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Error al exportar Excel');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-${tipoReporte}-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return true;
    } catch (error) {
      console.error('Error al exportar Excel:', error);
      throw error;
    }
  },

  
  async reportePersonalizado(config) {
    try {
      const response = await apiClient.post('/reportes/personalizado', config);
      return response;
    } catch (error) {
      console.error('Error al generar reporte personalizado:', error);
      throw error;
    }
  },

  
  async datosGrafico(tipoGrafico, filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.area) params.append('area', filtros.area);
      
      const response = await apiClient.get(`/reportes/graficos/${tipoGrafico}?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener datos del gráfico:', error);
      throw error;
    }
  },

  
  async reporteComparativo(periodo1, periodo2) {
    try {
      const response = await apiClient.post('/reportes/comparativo', {
        periodo1,
        periodo2
      });
      return response;
    } catch (error) {
      console.error('Error al obtener reporte comparativo:', error);
      throw error;
    }
  },

  
  async topTrabajadores(filtros = {}) {
    try {
      const params = new URLSearchParams();
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
      if (filtros.limite) params.append('limite', filtros.limite);
      
      const response = await apiClient.get(`/reportes/top-trabajadores?${params.toString()}`);
      return response;
    } catch (error) {
      console.error('Error al obtener top trabajadores:', error);
      throw error;
    }
  }
};

if (typeof window !== 'undefined') {
  window.ReportesAPI = ReportesAPI;
}
