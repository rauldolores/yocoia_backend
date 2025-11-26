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

    // 2. Programar cada video
    let programados = 0;
    let noProgramados = 0;

    for (const video of videos) {
      const canalId = video.guiones.canal_id;
      
      console.log(`📹 Procesando: ${video.titulo}`);
      console.log(`   Canal ID: ${canalId}`);

      // Encontrar próxima hora disponible
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
