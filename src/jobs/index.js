/**
 * Módulo de Jobs
 * 
 * Este módulo agrupa todos los trabajos programados (cron jobs) del sistema:
 * - Generación de videos cortos desde guiones
 * - Generación de videos largos por segmentos
 * - Programación de publicaciones
 * - Publicación en redes sociales
 * - Generación de guiones desde ideas
 * - Validación y generación de ideas
 * - Generación de assets (audio e imágenes)
 */

const { procesarVideos } = require('./video-generator');
const { procesarVideosLargos } = require('./long-video-generator');
const { programarPublicaciones } = require('./scheduler');
const { publicarEnRedesSociales } = require('./publisher');
const { generarGuionesDesdeIdeas } = require('./guion-generator');
const { validarYGenerarIdeas } = require('./ideas-validator');
const { generarAssets } = require('./assets-generator');

module.exports = {
  procesarVideos,
  procesarVideosLargos,
  programarPublicaciones,
  publicarEnRedesSociales,
  generarGuionesDesdeIdeas,
  validarYGenerarIdeas,
  generarAssets
};
