const { supabase, HORAS_PUBLICACION } = require('../../config');
const { obtenerFechaMexico, obtenerTimestampMexico, generarDesfaceAleatorio } = require('../../utils/date');

/**
 * Obtener videos ya programados para un canal en una fecha específica
 * @param {string} canalId - ID del canal
 * @param {Date} fecha - Fecha a consultar
 * @returns {Promise<Array>} - Array de objetos con hora base y timestamp completo
 */
async function obtenerHorasProgramadasPorCanal(canalId, fecha) {
  try {
    const inicioDelDia = new Date(fecha);
    inicioDelDia.setHours(0, 0, 0, 0);
    
    const finDelDia = new Date(fecha);
    finDelDia.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('videos')
      .select(`
        publicacion_programada_at,
        guiones!fk_videos_guion (
          canal_id
        )
      `)
      .eq('guiones.canal_id', canalId)
      .gte('publicacion_programada_at', inicioDelDia.toISOString())
      .lte('publicacion_programada_at', finDelDia.toISOString())
      .not('publicacion_programada_at', 'is', null);

    if (error) {
      console.error('❌ Error en consulta de horas programadas:', error);
      throw error;
    }

    // Extraer las horas base ya programadas (considerando ventana de tiempo)
    const horasProgramadas = (data || []).map(video => {
      const fechaProgramada = new Date(video.publicacion_programada_at);
      const hora = fechaProgramada.getHours();
      const minutos = fechaProgramada.getMinutes();
      
      return {
        horaBase: hora,
        timestamp: fechaProgramada,
        minutos: minutos
      };
    });

    return horasProgramadas;
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
  // Obtener hora actual en México
  const ahora = obtenerFechaMexico();
  
  // Intentar en los próximos 7 días
  for (let diasAdelante = 0; diasAdelante < 7; diasAdelante++) {
    const fechaObjetivo = new Date(ahora);
    fechaObjetivo.setDate(ahora.getDate() + diasAdelante);
    
    // Obtener videos ya programados para este día
    const videosOcupados = await obtenerHorasProgramadasPorCanal(canalId, fechaObjetivo);
    
    // Extraer solo las horas base ya ocupadas (sin importar los minutos exactos)
    const horasBaseOcupadas = videosOcupados.map(v => v.horaBase);
    
    // Filtrar horas disponibles (que no tengan videos programados en su ventana)
    const horasDisponibles = HORAS_PUBLICACION.filter(hora => !horasBaseOcupadas.includes(hora));
    
    // Si es hoy, solo considerar horas futuras
    if (diasAdelante === 0) {
      const horaActual = ahora.getHours();
      const minutosActuales = ahora.getMinutes();
      
      // Filtrar horas que ya pasaron (con margen considerando el desface máximo)
      const horasFuturas = horasDisponibles.filter(hora => {
        // Si la hora base es mayor, está disponible
        if (hora > horaActual) return true;
        // Si es la misma hora, verificar que haya tiempo suficiente (30 min de margen)
        if (hora === horaActual && minutosActuales < 30) return true;
        return false;
      });
      
      if (horasFuturas.length > 0) {
        const horaSeleccionada = horasFuturas[0];
        const desfaceMinutos = generarDesfaceAleatorio();
        
        const fechaProgramada = new Date(fechaObjetivo);
        fechaProgramada.setHours(horaSeleccionada, desfaceMinutos, 0, 0);
        
        console.log(`   🎲 Desface aleatorio: +${desfaceMinutos} minutos`);
        console.log(`   ⏰ Hora programada: ${fechaProgramada.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);
        
        return fechaProgramada;
      }
    } else {
      // Para días futuros, tomar la primera hora disponible
      if (horasDisponibles.length > 0) {
        const horaSeleccionada = horasDisponibles[0];
        const desfaceMinutos = generarDesfaceAleatorio();
        
        const fechaProgramada = new Date(fechaObjetivo);
        fechaProgramada.setHours(horaSeleccionada, desfaceMinutos, 0, 0);
        
        console.log(`   🎲 Desface aleatorio: +${desfaceMinutos} minutos`);
        console.log(`   ⏰ Hora programada: ${fechaProgramada.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);
        
        return fechaProgramada;
      }
    }
  }
  
  return null; // No hay horas disponibles en los próximos 7 días
}

/**
 * Programar hora de publicación para un video
 * @param {string} videoId - ID del video
 * @param {Date} fechaHora - Fecha y hora de publicación
 */
async function programarPublicacionVideo(videoId, fechaHora) {
  try {
    const { error } = await supabase
      .from('videos')
      .update({
        publicacion_programada_at: fechaHora.toISOString(),
        updated_at: obtenerTimestampMexico()
      })
      .eq('id', videoId);

    if (error) throw error;
    
    console.log(`✅ Video ${videoId} programado para: ${fechaHora.toLocaleString('es-MX')}`);
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
