/**
 * Exportar todos los servicios de audio
 */

const { extraerTextoDelGuion, generarAudioConElevenLabs } = require('./elevenlabs');
const { agregarMusicaDeFondo } = require('./processor');

module.exports = {
  // ElevenLabs
  extraerTextoDelGuion,
  generarAudioConElevenLabs,
  
  // Processor
  agregarMusicaDeFondo
};
