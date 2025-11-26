/**
 * Servicios de Guiones
 * 
 * Este módulo agrupa todos los servicios relacionados con la generación
 * de guiones desde ideas, incluyendo:
 * - Cliente de API para generación de guiones
 * - Procesamiento automático de ideas pendientes
 * - Vinculación de guiones generados con ideas
 */

const { generarGuionDesdeAPI } = require('./api-client');
const { generarGuionesDesdeIdeas, actualizarIdeaConGuion } = require('./generator');

module.exports = {
  // API Client
  generarGuionDesdeAPI,
  
  // Generator
  generarGuionesDesdeIdeas,
  actualizarIdeaConGuion
};
