/**
 * Módulo de Base de Datos
 * 
 * Este módulo agrupa todas las operaciones de base de datos y storage, incluyendo:
 * - Queries a Supabase (guiones, videos, media_assets, ideas)
 * - Operaciones de Storage (upload, download)
 * - Actualizaciones de estado
 */

const {
  obtenerGuionesPendientes,
  obtenerMediaAssets,
  obtenerVideosPendientesProgramar,
  obtenerVideosListosParaPublicar,
  actualizarEstadoGuion,
  actualizarVideoPublicado,
  registrarVideoEnDB
} = require('./queries');

const {
  subirVideoAStorage,
  descargarVideoParaPublicar,
  guardarMediaAssetAudio,
  subirAudioAStorage
} = require('./storage');

module.exports = {
  // Queries
  obtenerGuionesPendientes,
  obtenerMediaAssets,
  obtenerVideosPendientesProgramar,
  obtenerVideosListosParaPublicar,
  actualizarEstadoGuion,
  actualizarVideoPublicado,
  registrarVideoEnDB,
  
  // Storage
  subirVideoAStorage,
  descargarVideoParaPublicar,
  guardarMediaAssetAudio,
  subirAudioAStorage
};
