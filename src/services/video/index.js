/**
 * Servicios de Video
 * 
 * Este módulo agrupa todos los servicios relacionados con la generación
 * y procesamiento de videos, incluyendo:
 * - Generación de video con efectos (Ken Burns, panning, color grading)
 * - Transcripción de audio con Whisper
 * - Generación de subtítulos estilo TikTok/Reels
 */

const { generarVideo } = require('./generator');
const {
  transcribirAudioConWhisper,
  agruparPalabrasEnSubtitulos,
  formatearTiempoASS,
  generarArchivoASS
} = require('./subtitles');

module.exports = {
  // Generator
  generarVideo,
  
  // Subtitles
  transcribirAudioConWhisper,
  agruparPalabrasEnSubtitulos,
  formatearTiempoASS,
  generarArchivoASS
};
