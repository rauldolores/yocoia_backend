const { supabase, CHANNEL_FILTER } = require('../config');
const { obtenerTimestampMexico } = require('../utils/date');

/**
 * Obtener guiones pendientes de producir video
 * @param {Object} filtroCanales - Opcional, configuración de filtro de canales
 * @returns {Promise<Array>} - Array de guiones con estado "producir_video"
 */
async function obtenerGuionesPendientes(filtroCanales = null) {
  try {
    // Usar el filtro proporcionado o el global
    const filtro = filtroCanales || CHANNEL_FILTER;
    
    let query = supabase
      .from('guiones')
      .select(`
        id, 
        nombre, 
        titulo, 
        descripcion, 
        created_at, 
        guion_detallado_json, 
        prompt_generado,
        canal_id,
        canales(id, nombre)
      `)
      .eq('estado', 'producir_video')
      .order('created_at', { ascending: true });

    // Aplicar filtros de canales si está habilitado
    if (filtro.enabled && (filtro.channels.ids.length > 0 || filtro.channels.names.length > 0)) {
      // Si hay IDs especificados, filtrar por IDs
      if (filtro.channels.ids.length > 0) {
        query = query.in('canal_id', filtro.channels.ids);
      }
      
      // Si hay nombres especificados, necesitamos hacer un filtrado adicional en el resultado
      // porque Supabase no permite filtrar por campos de relaciones anidadas directamente en el query
    }

    const { data, error } = await query;

    if (error) throw error;
    
    let resultado = data || [];
    
    // Si hay filtro por nombres de canal, aplicarlo en memoria
    if (filtro.enabled && filtro.channels.names.length > 0 && resultado.length > 0) {
      resultado = resultado.filter(guion => {
        const nombreCanal = guion.canales?.nombre;
        return nombreCanal && filtro.channels.names.includes(nombreCanal);
      });
    }
    
    return resultado;
  } catch (error) {
    console.error('❌ Error al obtener guiones pendientes:', error.message);
    return [];
  }
}

/**
 * Obtener media assets (imágenes y audio) de un guion
 * @param {string} guionId - ID del guion
 * @returns {Promise<Object>} - Objeto con imágenes y audio
 */
async function obtenerMediaAssets(guionId) {
  try {
    const { data, error } = await supabase
      .from('media_assets')
      .select('id, tipo, url, metadata')
      .eq('guion_id', guionId)
      .in('tipo', ['imagen', 'audio']);

    if (error) throw error;

    // Separar imágenes y audio
    const imagenes = data.filter(item => item.tipo === 'imagen');
    const audio = data.find(item => item.tipo === 'audio');

    return { imagenes, audio };
  } catch (error) {
    console.error('❌ Error al obtener media assets:', error.message);
    throw error;
  }
}

/**
 * Obtener videos pendientes de programar
 * @param {Object} filtroCanales - Opcional, configuración de filtro de canales
 * @returns {Promise<Array>} - Array de videos sin hora programada
 */
async function obtenerVideosPendientesProgramar(filtroCanales = null) {
  try {
    const filtro = filtroCanales || CHANNEL_FILTER;
    
    const { data, error } = await supabase
      .from('videos')
      .select(`
        id,
        guion_id,
        titulo,
        created_at,
        guiones (
          id,
          canal_id,
          canales (id, nombre)
        )
      `)
      .eq('estado', 'pendiente_publicar')
      .is('publicacion_programada_at', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    
    let resultado = data || [];
    
    // Aplicar filtros de canales si está habilitado
    if (filtro.enabled && (filtro.channels.ids.length > 0 || filtro.channels.names.length > 0)) {
      resultado = resultado.filter(video => {
        const canalId = video.guiones?.canal_id;
        const nombreCanal = video.guiones?.canales?.nombre;
        
        // Filtrar por ID si hay IDs especificados
        if (filtro.channels.ids.length > 0 && !filtro.channels.ids.includes(canalId)) {
          return false;
        }
        
        // Filtrar por nombre si hay nombres especificados
        if (filtro.channels.names.length > 0 && !filtro.channels.names.includes(nombreCanal)) {
          return false;
        }
        
        return true;
      });
    }
    
    return resultado;
  } catch (error) {
    console.error('❌ Error al obtener videos pendientes de programar:', error.message);
    return [];
  }
}

/**
 * Obtener videos listos para publicar
 * @param {Object} filtroCanales - Opcional, configuración de filtro de canales
 * @returns {Promise<Array>} - Array de videos que deben publicarse ahora
 */
async function obtenerVideosListosParaPublicar(filtroCanales = null) {
  try {
    const filtro = filtroCanales || CHANNEL_FILTER;
    const ahora = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('videos')
      .select(`
        id,
        guion_id,
        titulo,
        descripcion,
        video_url,
        video_storage_path,
        publicacion_programada_at,
        youtube_video_id,
        facebook_post_id,
        metadata,
        guiones!inner (
          id,
          canal_id,
          canales!inner (
            id,
            nombre,
            credenciales,
            musica_fondo_youtube_url,
            musica_fondo_facebook_url
          )
        )
      `)
      .eq('estado', 'pendiente_publicar')
      .not('publicacion_programada_at', 'is', null)
      .lte('publicacion_programada_at', ahora)
      .order('publicacion_programada_at', { ascending: true });

    if (error) throw error;
    
    // Filtrar videos que aún tienen plataformas pendientes de publicar
    // Un video se considera "listo" si le falta YouTube o Facebook (o ambos)
    // Consideramos NULL o string vacío como "no publicado"
    let videosPendientes = (data || []).filter(video => {
      const tieneYouTube = video.youtube_video_id != null && video.youtube_video_id.trim() !== '';
      const tieneFacebook = video.facebook_post_id != null && video.facebook_post_id.trim() !== '';
      
      // Si ambos ya están publicados, omitir este video
      if (tieneYouTube && tieneFacebook) {
        return false;
      }
      
      // Si falta al menos una plataforma, incluir
      return true;
    });
    
    // Aplicar filtros de canales si está habilitado
    if (filtro.enabled && (filtro.channels.ids.length > 0 || filtro.channels.names.length > 0)) {
      videosPendientes = videosPendientes.filter(video => {
        const canalId = video.guiones?.canal_id;
        const nombreCanal = video.guiones?.canales?.nombre;
        
        // Filtrar por ID si hay IDs especificados
        if (filtro.channels.ids.length > 0 && !filtro.channels.ids.includes(canalId)) {
          return false;
        }
        
        // Filtrar por nombre si hay nombres especificados
        if (filtro.channels.names.length > 0 && !filtro.channels.names.includes(nombreCanal)) {
          return false;
        }
        
        return true;
      });
    }
    
    return videosPendientes;
  } catch (error) {
    console.error('❌ Error al obtener videos listos para publicar:', error.message);
    return [];
  }
}

/**
 * Actualizar estado del guion
 * @param {string} guionId - ID del guion
 * @param {string} nuevoEstado - Nuevo estado del guion
 */
async function actualizarEstadoGuion(guionId, nuevoEstado) {
  try {
    const { error } = await supabase
      .from('guiones')
      .update({ 
        estado: nuevoEstado,
        updated_at: obtenerTimestampMexico()
      })
      .eq('id', guionId);

    if (error) throw error;
    console.log(`✅ Estado del guion actualizado a: ${nuevoEstado}`);
  } catch (error) {
    console.error('⚠️  Error al actualizar estado del guion:', error.message);
  }
}

/**
 * Actualizar video después de publicación
 * @param {string} videoId - ID del video
 * @param {string} plataforma - youtube o facebook
 * @param {string} externalId - ID en la plataforma externa
 */
async function actualizarVideoPublicado(videoId, plataforma, externalId) {
  try {
    const updates = {
      updated_at: obtenerTimestampMexico()
    };

    if (plataforma === 'youtube' && externalId) {
      updates.youtube_video_id = externalId;
    } else if (plataforma === 'facebook' && externalId) {
      updates.facebook_post_id = externalId;
    }
    
    // Marcar como publicado solo si ambas plataformas tienen ID
    // Primero obtenemos el video actual
    const { data: videoActual } = await supabase
      .from('videos')
      .select('youtube_video_id, facebook_post_id')
      .eq('id', videoId)
      .single();
    
    // Si después de este update ambos IDs están presentes, marcar como publicado
    const youtubeId = plataforma === 'youtube' ? externalId : videoActual?.youtube_video_id;
    const facebookId = plataforma === 'facebook' ? externalId : videoActual?.facebook_post_id;
    
    if (youtubeId && facebookId) {
      updates.estado = 'publicado';
      updates.publicado_at = obtenerTimestampMexico();
    }

    const { error } = await supabase
      .from('videos')
      .update(updates)
      .eq('id', videoId);

    if (error) throw error;
    
    console.log(`✅ Video actualizado en BD (${plataforma}: ${externalId || 'sin ID'})`);
  } catch (error) {
    console.error('⚠️  Error al actualizar video en BD:', error.message);
  }
}

/**
 * Registrar video en la tabla videos
 * @param {Object} guion - Objeto del guion
 * @param {string} videoStoragePath - Ruta del video en Storage
 * @param {string} videoUrl - URL pública del video
 * @param {number} videoSizeBytes - Tamaño del video en bytes
 * @param {number} duracionSegundos - Duración del video en segundos
 * @returns {Promise<Object>} - Video registrado
 */
async function registrarVideoEnDB(guion, videoStoragePath, videoUrl, videoSizeBytes, duracionSegundos) {
  console.log('💾 Actualizando video en base de datos...');
  
  try {
    // Extraer títulos específicos para cada plataforma
    let tituloYouTube = guion.nombre || 'Video sin título';
    let tituloFacebook = guion.nombre || 'Video sin título';
    
    // Si el guion tiene un campo titulo (jsonb), extraer títulos por plataforma
    if (guion.titulo && typeof guion.titulo === 'object') {
      // YouTube Shorts tiene prioridad, sino usar el nombre del guion
      if (guion.titulo.youtube_shorts) {
        tituloYouTube = guion.titulo.youtube_shorts;
      }
      
      // Facebook
      if (guion.titulo.facebook) {
        tituloFacebook = guion.titulo.facebook;
      }
    }
    
    // Para la tabla videos, usar el título de YouTube como principal
    let titulo = tituloYouTube;
    
    // Extraer descripción
    let descripcion = guion.descripcion || '';
    
    // Buscar si ya existe un video para este guion
    const { data: videoExistente } = await supabase
      .from('videos')
      .select('id')
      .eq('guion_id', guion.id)
      .single();
    
    let video;
    
    if (videoExistente) {
      // Actualizar video existente
      console.log(`   Actualizando video existente ID: ${videoExistente.id}`);
      const { data, error: dbError } = await supabase
        .from('videos')
        .update({
          titulo: titulo,
          descripcion: descripcion,
          video_storage_path: videoStoragePath,
          video_url: videoUrl,
          video_size_bytes: videoSizeBytes,
          duracion_segundos: Math.round(duracionSegundos),
          estado: 'pendiente_publicar',
          metadata: {
            generado_automaticamente: true,
            fecha_generacion: obtenerTimestampMexico(),
            con_subtitulos: true,
            efecto_ken_burns: true,
            resolucion: '1080x1920',
            formato: '9:16',
            titulo_youtube: tituloYouTube,
            titulo_facebook: tituloFacebook
          }
        })
        .eq('id', videoExistente.id)
        .select()
        .single();

      if (dbError) {
        console.error('❌ Error actualizando video en DB:', dbError);
        throw new Error('Error al actualizar video en base de datos');
      }
      
      video = data;
    } else {
      // Insertar nuevo video si no existe
      console.log('   Creando nuevo registro de video');
      const { data, error: dbError } = await supabase
        .from('videos')
        .insert({
          guion_id: guion.id,
          titulo: titulo,
          descripcion: descripcion,
          video_storage_path: videoStoragePath,
          video_url: videoUrl,
          video_size_bytes: videoSizeBytes,
          duracion_segundos: Math.round(duracionSegundos),
          estado: 'pendiente_publicar',
          metadata: {
            generado_automaticamente: true,
            fecha_generacion: obtenerTimestampMexico(),
            con_subtitulos: true,
            efecto_ken_burns: true,
            resolucion: '1080x1920',
            formato: '9:16',
            titulo_youtube: tituloYouTube,
            titulo_facebook: tituloFacebook
          }
        })
        .select()
        .single();

      if (dbError) {
        console.error('❌ Error insertando video en DB:', dbError);
        throw new Error('Error al guardar video en base de datos');
      }
      
      video = data;
    }

    console.log(`✅ Video ${videoExistente ? 'actualizado' : 'registrado'} en DB con ID: ${video.id}`);
    console.log(`   Estado: ${video.estado}`);
    
    return video;
    
  } catch (error) {
    console.error('❌ Error al registrar/actualizar video:', error.message);
    throw error;
  }
}

module.exports = {
  obtenerGuionesPendientes,
  obtenerMediaAssets,
  obtenerVideosPendientesProgramar,
  obtenerVideosListosParaPublicar,
  actualizarEstadoGuion,
  actualizarVideoPublicado,
  registrarVideoEnDB
};
