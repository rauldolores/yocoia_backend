/**
 * Servicio de procesamiento de audio (música de fondo)
 */

const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { descargarArchivo, obtenerDuracionAudio } = require('../../utils/file');

/**
 * Agregar música de fondo al video
 * @param {string} rutaVideoOriginal - Ruta del video original
 * @param {string} urlMusicaFondo - URL de la música de fondo (MP3)
 * @param {string} rutaVideoSalida - Ruta del video con música
 * @param {number} volumen - Volumen de la música (0.0 a 1.0), por defecto 0.4 (40%)
 * @returns {Promise<string>} - Ruta del video con música
 */
async function agregarMusicaDeFondo(rutaVideoOriginal, urlMusicaFondo, rutaVideoSalida, volumen = 0.4) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('🎵 Agregando música de fondo...');
      
      // 1. Descargar música de fondo
      const nombreMusica = `musica_${Date.now()}.mp3`;
      const rutaMusica = path.join(path.dirname(rutaVideoOriginal), nombreMusica);
      
      console.log('   📥 Descargando música de fondo...');
      await descargarArchivo(urlMusicaFondo, rutaMusica);
      
      // 2. Obtener duración del video
      const duracionVideo = await obtenerDuracionAudio(rutaVideoOriginal);
      console.log(`   ⏱️  Duración del video: ${duracionVideo.toFixed(2)}s`);
      
      // 3. Procesar video con música de fondo
      console.log('   🎼 Mezclando audio...');
      
      // Calcular duración del fade out (últimos 3 segundos)
      const duracionFadeOut = 3;
      const inicioFadeOut = duracionVideo - duracionFadeOut;
      
      ffmpeg(rutaVideoOriginal)
        .input(rutaMusica)
        .complexFilter([
          // Recortar música a la duración del video
          `[1:a]atrim=0:${duracionVideo},asetpts=PTS-STARTPTS[musica_recortada]`,
          // Reducir volumen de música y aplicar fade out
          `[musica_recortada]volume=${volumen},afade=t=out:st=${inicioFadeOut}:d=${duracionFadeOut}[musica_ajustada]`,
          // Mezclar audio original con música de fondo
          `[0:a][musica_ajustada]amix=inputs=2:duration=first:dropout_transition=2[audio_final]`
        ])
        .outputOptions([
          '-map 0:v',           // Video del original
          '-map [audio_final]', // Audio mezclado
          '-c:v copy',          // Copiar video sin recodificar
          '-c:a aac',           // Codificar audio a AAC
          '-b:a 192k',          // Bitrate de audio
          '-shortest'           // Terminar cuando el stream más corto termine
        ])
        .output(rutaVideoSalida)
        .on('start', (commandLine) => {
          console.log('   🎥 Procesando video con música...');
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            process.stdout.write(`\r   ⏳ Progreso: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', () => {
          console.log('\n   ✅ Música de fondo agregada');
          // Eliminar archivo de música temporal
          try {
            fs.unlinkSync(rutaMusica);
          } catch (e) {
            console.warn('   ⚠️  No se pudo eliminar música temporal:', e.message);
          }
          resolve(rutaVideoSalida);
        })
        .on('error', (error, stdout, stderr) => {
          console.error('\n   ❌ Error al agregar música:', error.message);
          // Limpiar archivos temporales
          try {
            if (fs.existsSync(rutaMusica)) fs.unlinkSync(rutaMusica);
            if (fs.existsSync(rutaVideoSalida)) fs.unlinkSync(rutaVideoSalida);
          } catch (e) {}
          reject(error);
        })
        .run();
        
    } catch (error) {
      console.error('   ❌ Error en agregarMusicaDeFondo:', error.message);
      reject(error);
    }
  });
}

module.exports = {
  agregarMusicaDeFondo
};
