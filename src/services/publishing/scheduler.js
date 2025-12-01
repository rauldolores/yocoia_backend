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
    console.log(`            🔎 [DEBUG] Consultando videos programados:`);
    console.log(`               Canal ID buscado: ${canalId}`);
    console.log(`               Ventana: ${moment(ventana.inicio).tz(TIMEZONE).format('DD/MM/YYYY HH:mm')} - ${moment(ventana.fin).tz(TIMEZONE).format('DD/MM/YYYY HH:mm')}`);
    
    // Primero, obtener TODOS los videos en la ventana con sus guiones
    const { data: todosLosVideos, error } = await supabase
      .from('videos')
      .select(`
        id,
        guion_id,
        publicacion_programada_at
      `)
      .gte('publicacion_programada_at', ventana.inicio.toISOString())
      .lte('publicacion_programada_at', ventana.fin.toISOString())
      .not('publicacion_programada_at', 'is', null);

    if (error) {
      console.error('❌ Error en consulta de horas programadas:', error);
      throw error;
    }

    console.log(`               📊 Videos totales en ventana: ${todosLosVideos?.length || 0}`);

    // Si no hay videos, retornar vacío
    if (!todosLosVideos || todosLosVideos.length === 0) {
      return [];
    }

    // Obtener los guion_ids únicos
    const guionIds = [...new Set(todosLosVideos.map(v => v.guion_id))];
    
    // Consultar los guiones para obtener sus canal_id
    const { data: guiones, error: guionesError } = await supabase
      .from('guiones')
      .select('id, canal_id')
      .in('id', guionIds);

    if (guionesError) {
      console.error('❌ Error al consultar guiones:', guionesError);
      throw guionesError;
    }

    // Crear un mapa de guion_id -> canal_id
    const guionCanalMap = {};
    guiones?.forEach(g => {
      guionCanalMap[g.id] = g.canal_id;
    });

    // Filtrar videos que pertenecen al canal buscado
    const videosDelCanal = todosLosVideos.filter(v => {
      const canalDelVideo = guionCanalMap[v.guion_id];
      return canalDelVideo === canalId;
    });

    console.log(`               📊 Videos filtrados del canal: ${videosDelCanal.length}`);
    if (videosDelCanal.length > 0) {
      videosDelCanal.forEach((v, idx) => {
        const canalDelVideo = guionCanalMap[v.guion_id];
        console.log(`               ${idx + 1}. Video ${v.id}`);
        console.log(`                  - Guion ID: ${v.guion_id}`);
        console.log(`                  - Canal ID: ${canalDelVideo}`);
        console.log(`                  - Fecha programada: ${moment(v.publicacion_programada_at).tz(TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}`);
      });
    }

    return videosDelCanal;
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
  
  console.log(`\n   🔍 === INICIO BÚSQUEDA DE VENTANA ===`);
  console.log(`   📺 Canal ID: ${canalId}`);
  console.log(`   🌍 Zona horaria: ${TIMEZONE}`);
  console.log(`   🕐 Hora actual: ${ahora.format('DD/MM/YYYY HH:mm:ss')}`);
  console.log(`   📋 Horas configuradas: ${HORAS_PUBLICACION.join(', ')}`);
  console.log(`   ⏱️  Ventana de desface: ${MINUTOS_DESFACE_MIN}-${MINUTOS_DESFACE_MAX} minutos\n`);
  
  // Intentar en los próximos 30 días
  for (let dia = 0; dia < 30; dia++) {
    console.log(`   📅 Evaluando día +${dia} (${moment().tz(TIMEZONE).add(dia, 'days').format('DD/MM/YYYY')})`);
    
    for (const hora of HORAS_PUBLICACION) {
      // Crear fecha en la zona horaria configurada
      const fecha = moment().tz(TIMEZONE).add(dia, 'days').hour(hora).minute(0).second(0).millisecond(0);
      
      console.log(`      🕐 Evaluando hora: ${hora}:00 (${fecha.format('DD/MM/YYYY HH:mm:ss')})`);
      
      // Si la fecha ya pasó, continuar
      if (fecha.isSameOrBefore(ahora)) {
        console.log(`         ⏭️  OMITIDA: La hora ya pasó`);
        continue;
      }
      
      // Calcular ventana de tiempo para esta hora
      const inicioVentana = fecha.clone().minute(MINUTOS_DESFACE_MIN);
      const finVentana = fecha.clone().minute(MINUTOS_DESFACE_MAX);
      
      console.log(`         📊 Ventana: ${inicioVentana.format('HH:mm')} - ${finVentana.format('HH:mm')}`);
      
      // Verificar si YA HAY UN VIDEO DE ESTE CANAL en esta ventana
      const videosEnVentana = await obtenerHorasProgramadasPorCanal(canalId, {
        inicio: inicioVentana.toDate(),
        fin: finVentana.toDate()
      });
      
      console.log(`         🎬 Videos del canal en esta ventana: ${videosEnVentana.length}`);
      
      if (videosEnVentana.length > 0) {
        console.log(`         ❌ OCUPADA: Este canal ya tiene ${videosEnVentana.length} video(s) programado(s)`);
        videosEnVentana.forEach((v, idx) => {
          const fechaProg = moment(v.publicacion_programada_at).tz(TIMEZONE);
          console.log(`            ${idx + 1}. Video ${v.id} → ${fechaProg.format('DD/MM/YYYY HH:mm:ss')}`);
        });
        continue;
      }
      
      // Si ESTE CANAL no tiene video en esta ventana, programar aquí
      // (otros canales pueden tener videos en la misma ventana, eso está bien)
      console.log(`         ✅ DISPONIBLE: Esta ventana está libre para este canal`);
      
      // Calcular minuto aleatorio dentro de la ventana
      const minutosAleatorios = Math.floor(
        Math.random() * (MINUTOS_DESFACE_MAX - MINUTOS_DESFACE_MIN + 1)
      ) + MINUTOS_DESFACE_MIN;
      
      const fechaFinal = fecha.clone().minute(minutosAleatorios).second(0).millisecond(0);
      
      console.log(`         🎲 Desface aleatorio: +${minutosAleatorios} minutos`);
      console.log(`         ⏰ Hora seleccionada: ${fechaFinal.format('DD/MM/YYYY HH:mm:ss')}`);
      console.log(`   🎯 === FIN BÚSQUEDA: VENTANA ENCONTRADA ===\n`);
      
      return fechaFinal.toDate();
    }
  }
  
  // Fallback: programar mañana a la primera hora disponible con minuto aleatorio avanzado
  const minutosAleatorios = Math.floor(
    Math.random() * (MINUTOS_DESFACE_MAX - MINUTOS_DESFACE_MIN + 1)
  ) + MINUTOS_DESFACE_MIN;
  
  const fallback = moment().tz(TIMEZONE)
    .add(1, 'day')
    .hour(HORAS_PUBLICACION[0])
    .minute(minutosAleatorios)
    .second(0)
    .millisecond(0);
  
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
