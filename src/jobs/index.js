/**
 * Módulo de Jobs
 * 
 * Este módulo agrupa todos los trabajos programados (cron jobs) del sistema:
 * - Generación de videos desde guiones
 * - Programación de publicaciones
 * - Publicación en redes sociales
 * - Generación de guiones desde ideas
 */

const { procesarVideos } = require('./video-generator');
const { programarPublicaciones } = require('./scheduler');
const { publicarEnRedesSociales } = require('./publisher');
const { generarGuionesDesdeIdeas } = require('./guion-generator');

module.exports = {
  procesarVideos,
  programarPublicaciones,
  publicarEnRedesSociales,
  generarGuionesDesdeIdeas
};
