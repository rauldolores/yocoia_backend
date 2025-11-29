const moment = require('moment-timezone');
const { supabase, HORAS_PUBLICACION, MINUTOS_DESFACE_MIN, MINUTOS_DESFACE_MAX, TIMEZONE } = require('../../config');

/**
 * Obtener videos ya programados para un canal en una ventana de tiempo
 * @param {string} canalId - ID del canal
 * @param {Object} ventana - Objeto con inicio y fin (Date objects)
 * @returns {Promise<Array>} - Array de videos programados en esa ventana
 */
async function obtenerHorasProgramadasPorCanal(canalId, ventana) {
  try {
    const { data, error } = await supabase
      .from('videos')
      .select(`
        id,
        publicacion_programada_at,
        guiones!fk_videos_guion (
          canal_id
        )
      `)
      .eq('guiones.canal_id', canalId)
      .gte('publicacion_programada_at', ventana.inicio.toISOString())
      .lte('publicacion_programada_at', ventana.fin.toISOString())
      .not('publicacion_programada_at', 'is', null);

    if (error) {
      console.error('❌ Error en consulta de horas programadas:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('⚠️  Error al obtener horas programadas:', error.message);
    return [];
  }
}

/**
 * Encontrar la próxima hora disponible para publicar
 * @param {string} canalId - ID del canal
 * @returns {Promise<Date|null>} - Fecha y hora disponible o null
 */
async function encontrarProximaHoraDisponible(canalId) {
  // Obtener hora actual en la zona horaria configurada
  const ahora = moment().tz(TIMEZONE);
  
  console.log(`   🌍 Buscando ventana en ${TIMEZONE}: ${ahora.format('DD/MM/YYYY HH:mm:ss')}`);
  
  // Intentar en los próximos 30 días
  for (let dia = 0; dia < 30; dia++) {
    for (const hora of HORAS_PUBLICACION) {
      // Crear fecha en la zona horaria configurada
      const fecha = moment().tz(TIMEZONE).add(dia, 'days').hour(hora).minute(0).second(0).millisecond(0);
      
      // Si la fecha ya pasó, continuar
      if (fecha.isSameOrBefore(ahora)) {
        continue;
      }
      
      // Calcular ventana de tiempo para esta hora
      const inicioVentana = fecha.clone().minute(MINUTOS_DESFACE_MIN);
      const finVentana = fecha.clone().minute(MINUTOS_DESFACE_MAX);
      
      // Verificar si hay videos ya programados en esta ventana
      const videosEnVentana = await obtenerHorasProgramadasPorCanal(canalId, {
        inicio: inicioVentana.toDate(),
        fin: finVentana.toDate()
      });
      
      // Si la ventana está libre, programar aquí
      if (videosEnVentana.length === 0) {
        // Calcular minuto aleatorio dentro de la ventana
        const minutosAleatorios = Math.floor(
          Math.random() * (MINUTOS_DESFACE_MAX - MINUTOS_DESFACE_MIN + 1)
        ) + MINUTOS_DESFACE_MIN;
        
        const fechaFinal = fecha.clone().minute(minutosAleatorios).second(0).millisecond(0);
        
        console.log(`   🎲 Desface aleatorio: +${minutosAleatorios} minutos`);
        console.log(`   ⏰ Hora programada: ${fechaFinal.format('DD/MM/YYYY, h:mm:ss a')}`);
        
        return fechaFinal.toDate();
      }
    }
  }
  
  // Fallback: programar mañana a la primera hora disponible
  const fallback = moment().tz(TIMEZONE).add(1, 'day').hour(HORAS_PUBLICACION[0]).minute(MINUTOS_DESFACE_MIN).second(0).millisecond(0);
  
  console.log(`   ⚠️  No se encontró ventana disponible en 30 días`);
  console.log(`   📅 Programando en fallback: ${fallback.format('DD/MM/YYYY, h:mm:ss a')}`);
  
  return fallback.toDate();
}

/**
 * Programar hora de publicación para un video
 * @param {string} videoId - ID del video
 * @param {Date} fechaHora - Fecha y hora de publicación
 */
async function programarPublicacionVideo(videoId, fechaHora) {
  try {
    const ahora = moment().tz(TIMEZONE);
    
    const { error } = await supabase
      .from('videos')
      .update({
        publicacion_programada_at: fechaHora.toISOString(),
        updated_at: ahora.toDate().toISOString()
      })
      .eq('id', videoId);

    if (error) throw error;
    
    const fechaMoment = moment(fechaHora).tz(TIMEZONE);
    console.log(`✅ Video ${videoId} programado para: ${fechaMoment.format('DD/MM/YYYY, h:mm:ss a')}`);
  } catch (error) {
    console.error('❌ Error al programar video:', error.message);
    throw error;
  }
}

module.exports = {
  obtenerHorasProgramadasPorCanal,
  encontrarProximaHoraDisponible,
  programarPublicacionVideo
};
