/**
 * Servicios de Publicación
 * 
 * Este módulo agrupa todos los servicios relacionados con la publicación
 * de videos en plataformas sociales, incluyendo:
 * - Publicación en YouTube (OAuth2, Shorts)
 * - Publicación en Facebook (Graph API v18.0, upload resumible)
 * - Programación de publicaciones (scheduling con desface aleatorio)
 */

const { publicarEnYouTube } = require('./youtube');
const { publicarEnFacebook } = require('./facebook');
const {
  obtenerHorasProgramadasPorCanal,
  encontrarProximaHoraDisponible,
  programarPublicacionVideo
} = require('./scheduler');

module.exports = {
  // YouTube
  publicarEnYouTube,
  
  // Facebook
  publicarEnFacebook,
  
  // Scheduler
  obtenerHorasProgramadasPorCanal,
  encontrarProximaHoraDisponible,
  programarPublicacionVideo
};
