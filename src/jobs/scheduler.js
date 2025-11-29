const { TIMEZONE } = require('../config');
const { obtenerFechaMexico } = require('../utils/date');
const { obtenerVideosPendientesProgramar } = require('../database');
const { encontrarProximaHoraDisponible, programarPublicacionVideo } = require('../services/publishing');

/**
 * Proceso principal de programación de publicaciones
 */
async function programarPublicaciones() {
  console.log('\n' + '='.repeat(80));
  console.log('📅 INICIANDO PROGRAMACIÓN DE PUBLICACIONES');
  console.log('⏰ Timestamp México:', obtenerFechaMexico().toLocaleString('es-MX', { timeZone: TIMEZONE }));
  console.log('='.repeat(80) + '\n');

  try {
    // 1. Obtener videos pendientes de programar
    console.log('📋 Consultando videos pendientes de programar...');
    const videos = await obtenerVideosPendientesProgramar();

    if (!videos || videos.length === 0) {
      console.log('⚠️  No hay videos pendientes de programar');
      return;
    }

    console.log(`✅ ${videos.length} video(s) pendiente(s) de programar\n`);

    // 2. Agrupar videos por canal
    const videosPorCanal = {};
    for (const video of videos) {
      const canalId = video.guiones.canal_id;
      if (!videosPorCanal[canalId]) {
        videosPorCanal[canalId] = [];
      }
      videosPorCanal[canalId].push(video);
    }

    console.log(`📺 Canales detectados: ${Object.keys(videosPorCanal).length}`);
    for (const [canalId, vids] of Object.entries(videosPorCanal)) {
      const nombreCanal = vids[0]?.guiones?.canales?.nombre || 'Desconocido';
      console.log(`   • ${nombreCanal}: ${vids.length} video(s)`);
    }
    console.log('');

    // 3. Programar videos de forma intercalada por canal
    let programados = 0;
    let noProgramados = 0;
    
    // Encontrar el canal con más videos para determinar cuántas iteraciones necesitamos
    const maxVideos = Math.max(...Object.values(videosPorCanal).map(v => v.length));
    
    // Iterar por índice (0, 1, 2, ...) para tomar un video de cada canal en cada iteración
    for (let i = 0; i < maxVideos; i++) {
      for (const [canalId, videosCanal] of Object.entries(videosPorCanal)) {
        // Si este canal aún tiene videos en este índice
        if (i < videosCanal.length) {
          const video = videosCanal[i];
          
          console.log(`📹 Procesando: ${video.titulo}`);
          console.log(`   Canal: ${video.guiones?.canales?.nombre || canalId}`);

          // Encontrar próxima hora disponible para este canal
          const fechaHora = await encontrarProximaHoraDisponible(canalId);

          if (fechaHora) {
            await programarPublicacionVideo(video.id, fechaHora);
            programados++;
          } else {
            console.log(`⚠️  No hay horarios disponibles para el video ${video.id}`);
            noProgramados++;
          }
          
          console.log('');
        }
      }
    }

    console.log('='.repeat(80));
    console.log('✅ PROGRAMACIÓN COMPLETADA');
    console.log(`   Programados: ${programados}`);
    console.log(`   Sin programar: ${noProgramados}`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR EN PROGRAMACIÓN:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

module.exports = {
  programarPublicaciones
};
