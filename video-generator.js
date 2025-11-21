/**
 * Script de generación automática de videos
 * Ejecuta cada 10 minutos mediante cron para procesar el último guion creado
 * y generar un video con imágenes ordenadas, efecto Ken Burns y audio
 */

// Cargar variables de entorno desde .env
require('dotenv').config();

const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const OpenAI = require('openai');
const fetch = require('node-fetch');

// Configurar rutas de FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// =============================================================================
// CONFIGURACIÓN
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'gbTn1bmCvNgk0QEAVyfM';

// APIs de redes sociales
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

// Validar variables de entorno básicas
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERROR: Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('❌ ERROR: Falta variable de entorno OPENAI_API_KEY');
  process.exit(1);
}

if (!ELEVENLABS_API_KEY) {
  console.error('❌ ERROR: Falta variable de entorno ELEVENLABS_API_KEY');
  process.exit(1);
}

// Advertir si faltan credenciales de redes sociales (no bloquear el inicio)
if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
  console.warn('⚠️  ADVERTENCIA: Faltan credenciales de YouTube (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET)');
  console.warn('   La publicación en YouTube estará deshabilitada');
}

if (!FACEBOOK_ACCESS_TOKEN) {
  console.warn('⚠️  ADVERTENCIA: Falta FACEBOOK_ACCESS_TOKEN');
  console.warn('   La publicación en Facebook estará deshabilitada');
}

// Inicializar cliente de Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Inicializar cliente de OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Directorios
const TEMP_DIR = path.join(__dirname, 'temp');
const EXPORTS_DIR = path.join(__dirname, 'exports');

// Configuración de video
const VIDEO_CONFIG = {
  width: 1080,   // Formato vertical 9:16
  height: 1920,  // Formato vertical 9:16
  codec: 'libx264',
  preset: 'medium',
  crf: 23,
  pixelFormat: 'yuv420p'
};

// Configuración efecto Ken Burns
const KEN_BURNS = {
  zoomStart: 1.5,  // Inicia con zoom out (más alejado)
  zoomEnd: 1.0     // Termina con zoom in (más cerca)
};

// Configuración de programación de publicaciones
const HORAS_PUBLICACION = [9, 12, 15, 18, 21]; // Horas del día para publicar (formato 24h)

// =============================================================================
// UTILIDADES
// =============================================================================

/**
 * Crear directorios si no existen
 */
function crearDirectorios() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`📁 Directorio temporal creado: ${TEMP_DIR}`);
  }
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    console.log(`📁 Directorio de exportación creado: ${EXPORTS_DIR}`);
  }
}

/**
 * Limpiar archivos temporales
 */
function limpiarTemp() {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      const archivos = fs.readdirSync(TEMP_DIR);
      archivos.forEach(archivo => {
        fs.unlinkSync(path.join(TEMP_DIR, archivo));
      });
      console.log('🧹 Archivos temporales eliminados');
    }
  } catch (error) {
    console.error('⚠️  Error al limpiar archivos temporales:', error.message);
  }
}

/**
 * Descargar archivo desde URL
 * @param {string} url - URL del archivo
 * @param {string} destino - Ruta de destino local
 * @returns {Promise<string>} - Ruta del archivo descargado
 */
function descargarArchivo(url, destino) {
  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith('https') ? https : http;
    const archivo = fs.createWriteStream(destino);

    protocolo.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Error al descargar: ${response.statusCode}`));
        return;
      }

      response.pipe(archivo);

      archivo.on('finish', () => {
        archivo.close();
        resolve(destino);
      });
    }).on('error', (error) => {
      fs.unlinkSync(destino);
      reject(error);
    });
  });
}

/**
 * Obtener duración de audio usando ffprobe
 * @param {string} rutaArchivo - Ruta del archivo de audio
 * @returns {Promise<number>} - Duración en segundos
 */
function obtenerDuracionAudio(rutaArchivo) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(rutaArchivo, (error, metadata) => {
      if (error) {
        reject(error);
        return;
      }
      const duracion = metadata.format.duration;
      resolve(duracion);
    });
  });
}

/**
 * Extraer texto del guion para generar narración
 * @param {Object} guion - Objeto del guion
 * @returns {string} - Texto extraído del guion
 */
function extraerTextoDelGuion(guion) {
  // Intentar obtener texto de diferentes campos posibles
  if (guion.guion_detallado_json) {
    // Si tiene el guion detallado en JSON
    const guionDetallado = guion.guion_detallado_json;
    
    // Buscar el campo de narración o texto
    if (guionDetallado.narracion) {
      return guionDetallado.narracion;
    }
    
    if (guionDetallado.texto) {
      return guionDetallado.texto;
    }
    
    // Si tiene escenas, concatenar todas las narraciones
    if (guionDetallado.escenas && Array.isArray(guionDetallado.escenas)) {
      return guionDetallado.escenas
        .map(escena => escena.narracion || escena.texto || '')
        .filter(texto => texto.length > 0)
        .join(' ');
    }
  }
  
  // Si tiene prompt generado, usarlo
  if (guion.prompt_generado) {
    return guion.prompt_generado;
  }
  
  // Si tiene descripción
  if (guion.descripcion) {
    return guion.descripcion;
  }
  
  return '';
}

/**
 * Generar audio con ElevenLabs
 * @param {string} guionId - ID del guion
 * @param {string} texto - Texto para generar audio
 * @returns {Promise<Object>} - Objeto con información del audio generado
 */
async function generarAudioConElevenLabs(guionId, texto) {
  console.log('🎙️ Generando narración con ElevenLabs Multilingual v2...');
  console.log(`   Voice ID: ${ELEVENLABS_VOICE_ID}`);
  console.log(`   Texto length: ${texto.length} caracteres`);
  
  try {
    // Llamar a ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: texto,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error de ElevenLabs:', errorText);
      throw new Error(`Error de ElevenLabs: ${response.status} - ${errorText}`);
    }

    // Convertir respuesta a buffer
    const audioBuffer = await response.arrayBuffer();
    console.log(`✅ Audio generado: ${audioBuffer.byteLength} bytes`);

    // Generar nombre de archivo único
    const timestamp = Date.now();
    const filename = `narracion_${guionId}_${timestamp}.mp3`;
    const storagePath = `audio/narracion/${filename}`;

    // Convertir ArrayBuffer a Buffer de Node.js
    const buffer = Buffer.from(audioBuffer);

    // Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('media-assets')
      .upload(storagePath, buffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Error subiendo a Storage:', uploadError);
      throw new Error('Error al subir audio a Storage');
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('media-assets')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;
    console.log(`📦 Audio subido a Storage: ${publicUrl}`);

    // Guardar referencia en media_assets
    const { data: mediaAsset, error: dbError } = await supabase
      .from('media_assets')
      .insert({
        guion_id: guionId,
        tipo: 'audio',
        storage_path: storagePath,
        url: publicUrl,
        metadata: {
          tipo: 'narracion',
          voice_id: ELEVENLABS_VOICE_ID,
          model: 'eleven_multilingual_v2',
          texto_length: texto.length,
          size_bytes: audioBuffer.byteLength,
        },
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ Error guardando en DB:', dbError);
      throw new Error('Error al guardar referencia en base de datos');
    }

    console.log('✅ Referencia guardada en media_assets');

    return {
      id: mediaAsset.id,
      url: publicUrl,
      storage_path: storagePath,
    };
    
  } catch (error) {
    console.error('❌ Error al generar audio con ElevenLabs:', error.message);
    throw error;
  }
}

// =============================================================================
// CONSULTAS A SUPABASE
// =============================================================================

/**
 * Obtener guiones pendientes de producir video
 * @returns {Promise<Array>} - Array de guiones con estado "producir_video"
 */
async function obtenerGuionesPendientes() {
  try {
    const { data, error } = await supabase
      .from('guiones')
      .select('id, nombre, titulo, descripcion, created_at, guion_detallado_json, prompt_generado')
      .eq('estado', 'producir_video')
      .order('created_at', { ascending: true }); // Procesar del más antiguo al más reciente

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('❌ Error al obtener guiones pendientes:', error.message);
    return [];
  }
}

/**
 * Subir video a Supabase Storage
 * @param {string} rutaVideoLocal - Ruta local del video
 * @param {string} guionId - ID del guion
 * @returns {Promise<Object>} - Información del video subido
 */
async function subirVideoAStorage(rutaVideoLocal, guionId) {
  console.log('📤 Subiendo video a Supabase Storage...');
  
  try {
    // Leer el archivo de video
    const videoBuffer = await fsPromises.readFile(rutaVideoLocal);
    const videoSizeBytes = videoBuffer.length;
    
    // Generar nombre de archivo único
    const timestamp = Date.now();
    const filename = `video_${guionId}_${timestamp}.mp4`;
    const storagePath = `videos/${filename}`;
    
    // Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('media-assets')
      .upload(storagePath, videoBuffer, {
        contentType: 'video/mp4',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Error subiendo video a Storage:', uploadError);
      throw new Error('Error al subir video a Storage');
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('media-assets')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;
    console.log(`✅ Video subido a Storage: ${publicUrl}`);
    
    return {
      storage_path: storagePath,
      url: publicUrl,
      size_bytes: videoSizeBytes
    };
    
  } catch (error) {
    console.error('❌ Error al subir video:', error.message);
    throw error;
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
    // Extraer título del guion
    let titulo = guion.nombre || 'Video sin título';
    
    // Si el guion tiene un campo titulo (jsonb), extraerlo
    if (guion.titulo) {
      if (typeof guion.titulo === 'string') {
        titulo = guion.titulo;
      } else if (guion.titulo.texto) {
        titulo = guion.titulo.texto;
      }
    }
    
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
            fecha_generacion: new Date().toISOString(),
            con_subtitulos: true,
            efecto_ken_burns: true,
            resolucion: '1080x1920',
            formato: '9:16'
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
            fecha_generacion: new Date().toISOString(),
            con_subtitulos: true,
            efecto_ken_burns: true,
            resolucion: '1080x1920',
            formato: '9:16'
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
        updated_at: new Date().toISOString()
      })
      .eq('id', guionId);

    if (error) throw error;
    console.log(`✅ Estado del guion actualizado a: ${nuevoEstado}`);
  } catch (error) {
    console.error('⚠️  Error al actualizar estado del guion:', error.message);
  }
}

// =============================================================================
// PROGRAMACIÓN DE PUBLICACIONES
// =============================================================================

/**
 * Obtener videos pendientes de programar
 * @returns {Promise<Array>} - Array de videos sin hora programada
 */
async function obtenerVideosPendientesProgramar() {
  try {
    const { data, error } = await supabase
      .from('videos')
      .select(`
        id,
        guion_id,
        titulo,
        created_at,
        guiones!inner (
          id,
          canal_id
        )
      `)
      .eq('estado', 'pendiente_publicar')
      .is('publicacion_programada_at', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('❌ Error al obtener videos pendientes de programar:', error.message);
    return [];
  }
}

/**
 * Obtener videos ya programados para un canal en una fecha específica
 * @param {string} canalId - ID del canal
 * @param {Date} fecha - Fecha a consultar
 * @returns {Promise<Array>} - Horas ya ocupadas
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
        guiones!inner (
          canal_id
        )
      `)
      .eq('guiones.canal_id', canalId)
      .gte('publicacion_programada_at', inicioDelDia.toISOString())
      .lte('publicacion_programada_at', finDelDia.toISOString())
      .not('publicacion_programada_at', 'is', null);

    if (error) throw error;

    // Extraer las horas ya programadas
    const horasProgramadas = (data || []).map(video => {
      const fecha = new Date(video.publicacion_programada_at);
      return fecha.getHours();
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
  const ahora = new Date();
  const zonaHoraria = 'America/Mexico_City'; // Ajustar según tu zona horaria
  
  // Intentar en los próximos 7 días
  for (let diasAdelante = 0; diasAdelante < 7; diasAdelante++) {
    const fechaObjetivo = new Date(ahora);
    fechaObjetivo.setDate(ahora.getDate() + diasAdelante);
    
    // Obtener horas ya ocupadas para este día
    const horasOcupadas = await obtenerHorasProgramadasPorCanal(canalId, fechaObjetivo);
    
    // Filtrar horas disponibles
    const horasDisponibles = HORAS_PUBLICACION.filter(hora => !horasOcupadas.includes(hora));
    
    // Si es hoy, solo considerar horas futuras
    if (diasAdelante === 0) {
      const horaActual = ahora.getHours();
      const minutosActuales = ahora.getMinutes();
      
      // Filtrar horas que ya pasaron (con margen de 30 minutos)
      const horasFuturas = horasDisponibles.filter(hora => {
        if (hora > horaActual) return true;
        if (hora === horaActual && minutosActuales < 30) return true;
        return false;
      });
      
      if (horasFuturas.length > 0) {
        const horaSeleccionada = horasFuturas[0];
        const fechaProgramada = new Date(fechaObjetivo);
        fechaProgramada.setHours(horaSeleccionada, 0, 0, 0);
        return fechaProgramada;
      }
    } else {
      // Para días futuros, tomar la primera hora disponible
      if (horasDisponibles.length > 0) {
        const horaSeleccionada = horasDisponibles[0];
        const fechaProgramada = new Date(fechaObjetivo);
        fechaProgramada.setHours(horaSeleccionada, 0, 0, 0);
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
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);

    if (error) throw error;
    
    console.log(`✅ Video ${videoId} programado para: ${fechaHora.toLocaleString('es-MX')}`);
  } catch (error) {
    console.error('❌ Error al programar video:', error.message);
    throw error;
  }
}

/**
 * Proceso principal de programación de publicaciones
 */
async function programarPublicaciones() {
  console.log('\n' + '='.repeat(80));
  console.log('📅 INICIANDO PROGRAMACIÓN DE PUBLICACIONES');
  console.log('⏰ Timestamp:', new Date().toLocaleString('es-MX'));
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

// =============================================================================
// PUBLICACIÓN EN REDES SOCIALES
// =============================================================================

/**
 * Obtener videos listos para publicar
 * @returns {Promise<Array>} - Array de videos que deben publicarse ahora
 */
async function obtenerVideosListosParaPublicar() {
  try {
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
        guiones!inner (
          id,
          canal_id,
          canales!inner (
            id,
            nombre,
            plataforma,
            credenciales
          )
        )
      `)
      .eq('estado', 'pendiente_publicar')
      .not('publicacion_programada_at', 'is', null)
      .lte('publicacion_programada_at', ahora)
      .order('publicacion_programada_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('❌ Error al obtener videos listos para publicar:', error.message);
    return [];
  }
}

/**
 * Descargar video desde Supabase Storage
 * @param {string} videoUrl - URL del video
 * @param {string} destino - Ruta local de destino
 * @returns {Promise<string>} - Ruta del archivo descargado
 */
async function descargarVideoParaPublicar(videoUrl, destino) {
  console.log('⬇️  Descargando video desde Storage...');
  
  return new Promise((resolve, reject) => {
    const protocolo = videoUrl.startsWith('https') ? https : http;
    const archivo = fs.createWriteStream(destino);

    protocolo.get(videoUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Error al descargar video: ${response.statusCode}`));
        return;
      }

      response.pipe(archivo);

      archivo.on('finish', () => {
        archivo.close();
        console.log(`✅ Video descargado: ${destino}`);
        resolve(destino);
      });
    }).on('error', (error) => {
      fs.unlinkSync(destino);
      reject(error);
    });
  });
}

/**
 * Publicar video en YouTube
 * @param {Object} video - Objeto del video
 * @param {Object} canal - Objeto del canal con credenciales
 * @param {string} rutaVideoLocal - Ruta local del video
 * @returns {Promise<string>} - ID del video en YouTube
 */
async function publicarEnYouTube(video, canal, rutaVideoLocal) {
  console.log('📺 Publicando en YouTube...');
  
  try {
    if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
      throw new Error('Credenciales de YouTube no configuradas');
    }

    // TODO: Implementar con googleapis
    // Aquí debes usar la librería de YouTube API
    // Por ahora retornamos un placeholder
    
    console.log(`   Canal: ${canal.nombre}`);
    console.log(`   Título: ${video.titulo}`);
    console.log(`   Descripción: ${video.descripcion?.substring(0, 100)}...`);
    
    // Simular publicación (reemplazar con código real)
    console.warn('⚠️  Publicación en YouTube pendiente de implementar con googleapis');
    console.warn('   Necesitas instalar: npm install googleapis');
    
    // Retornar ID simulado (eliminar cuando implementes)
    return null;
    
  } catch (error) {
    console.error('❌ Error al publicar en YouTube:', error.message);
    throw error;
  }
}

/**
 * Publicar video en Facebook
 * @param {Object} video - Objeto del video
 * @param {Object} canal - Objeto del canal con credenciales
 * @param {string} rutaVideoLocal - Ruta local del video
 * @returns {Promise<string>} - ID del post en Facebook
 */
async function publicarEnFacebook(video, canal, rutaVideoLocal) {
  console.log('📘 Publicando en Facebook...');
  
  try {
    if (!FACEBOOK_ACCESS_TOKEN) {
      throw new Error('Token de Facebook no configurado');
    }

    console.log(`   Página: ${canal.nombre}`);
    console.log(`   Título: ${video.titulo}`);
    
    // TODO: Implementar con Facebook Graph API
    // Usar fb-node o llamadas directas a la API
    
    console.warn('⚠️  Publicación en Facebook pendiente de implementar');
    console.warn('   Usa Facebook Graph API para subir videos');
    
    // Retornar ID simulado (eliminar cuando implementes)
    return null;
    
  } catch (error) {
    console.error('❌ Error al publicar en Facebook:', error.message);
    throw error;
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
      updated_at: new Date().toISOString()
    };

    if (plataforma === 'youtube' && externalId) {
      updates.youtube_video_id = externalId;
      updates.estado = 'publicado';
      updates.publicado_at = new Date().toISOString();
    } else if (plataforma === 'facebook' && externalId) {
      updates.facebook_post_id = externalId;
      updates.estado = 'publicado';
      updates.publicado_at = new Date().toISOString();
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
 * Proceso principal de publicación en redes sociales
 */
async function publicarEnRedesSociales() {
  console.log('\n' + '='.repeat(80));
  console.log('📱 INICIANDO PUBLICACIÓN EN REDES SOCIALES');
  console.log('⏰ Timestamp:', new Date().toLocaleString('es-MX'));
  console.log('='.repeat(80) + '\n');

  const tempPublicacion = path.join(TEMP_DIR, `publicacion_${Date.now()}`);

  try {
    // Crear directorio temporal
    if (!fs.existsSync(tempPublicacion)) {
      fs.mkdirSync(tempPublicacion, { recursive: true });
    }

    // 1. Obtener videos listos para publicar
    console.log('📋 Consultando videos listos para publicar...');
    const videos = await obtenerVideosListosParaPublicar();

    if (!videos || videos.length === 0) {
      console.log('⚠️  No hay videos listos para publicar en este momento');
      return;
    }

    console.log(`✅ ${videos.length} video(s) listo(s) para publicar\n`);

    // 2. Publicar cada video
    let publicadosYouTube = 0;
    let publicadosFacebook = 0;
    let errores = 0;

    for (const video of videos) {
      const canal = video.guiones.canales;
      const plataforma = canal.plataforma?.toLowerCase();

      console.log('─'.repeat(80));
      console.log(`📹 Publicando: ${video.titulo}`);
      console.log(`   Canal: ${canal.nombre} (${plataforma})`);
      console.log(`   Programado: ${new Date(video.publicacion_programada_at).toLocaleString('es-MX')}`);

      try {
        // Descargar video
        const rutaVideoLocal = path.join(tempPublicacion, `video_${video.id}.mp4`);
        await descargarVideoParaPublicar(video.video_url, rutaVideoLocal);

        // Publicar según la plataforma del canal
        if (plataforma === 'youtube') {
          const youtubeId = await publicarEnYouTube(video, canal, rutaVideoLocal);
          await actualizarVideoPublicado(video.id, 'youtube', youtubeId);
          publicadosYouTube++;
        } else if (plataforma === 'facebook') {
          const facebookId = await publicarEnFacebook(video, canal, rutaVideoLocal);
          await actualizarVideoPublicado(video.id, 'facebook', facebookId);
          publicadosFacebook++;
        } else {
          console.warn(`⚠️  Plataforma no soportada: ${plataforma}`);
        }

        // Eliminar archivo temporal del video
        if (fs.existsSync(rutaVideoLocal)) {
          fs.unlinkSync(rutaVideoLocal);
        }

        console.log(`✅ Video publicado exitosamente\n`);

      } catch (error) {
        console.error(`❌ Error publicando video ${video.id}:`, error.message);
        errores++;
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log('✅ PUBLICACIÓN COMPLETADA');
    console.log(`   YouTube: ${publicadosYouTube}`);
    console.log(`   Facebook: ${publicadosFacebook}`);
    console.log(`   Errores: ${errores}`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR EN PUBLICACIÓN:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Limpiar directorio temporal
    if (fs.existsSync(tempPublicacion)) {
      try {
        await fsPromises.rm(tempPublicacion, { recursive: true, force: true });
      } catch (cleanError) {
        console.error('⚠️  Error al limpiar directorio temporal:', cleanError.message);
      }
    }
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
 * Ordenar imágenes por número de escena
 * @param {Array} imagenes - Array de objetos de imagen
 * @returns {Array} - Array ordenado
 */
function ordenarImagenesPorEscena(imagenes) {
  return imagenes.sort((a, b) => {
    const escenaA = a.metadata?.escena;
    const escenaB = b.metadata?.escena;

    // Si alguna no tiene escena, va al final
    if (escenaA === undefined || escenaA === null) {
      console.warn(`⚠️  Imagen ${a.id} no tiene metadata.escena, se colocará al final`);
      return 1;
    }
    if (escenaB === undefined || escenaB === null) {
      console.warn(`⚠️  Imagen ${b.id} no tiene metadata.escena, se colocará al final`);
      return -1;
    }

    return escenaA - escenaB;
  });
}

// =============================================================================
// TRANSCRIPCIÓN Y SUBTÍTULOS
// =============================================================================

/**
 * Transcribir audio con OpenAI Whisper
 * @param {string} rutaAudio - Ruta del archivo de audio
 * @returns {Promise<Array>} - Array de palabras con timestamps
 */
async function transcribirAudioConWhisper(rutaAudio) {
  console.log('🎙️  Transcribiendo audio con OpenAI Whisper...');
  
  try {
    const audioFile = fs.createReadStream(rutaAudio);
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'es',
      response_format: 'verbose_json',
      timestamp_granularities: ['word']
    });

    if (!transcription.words || transcription.words.length === 0) {
      throw new Error('No se obtuvieron palabras con timestamps');
    }

    console.log(`✅ Transcripción completada: ${transcription.words.length} palabras detectadas`);
    console.log(`   Texto completo: "${transcription.text}"`);
    return transcription.words;
    
  } catch (error) {
    console.error('❌ Error al transcribir audio:', error.message);
    throw error;
  }
}

/**
 * Agrupar palabras en subtítulos estilo TikTok (1-3 palabras)
 * @param {Array} words - Array de palabras con timestamps
 * @param {number} maxPalabras - Máximo de palabras por subtítulo
 * @returns {Array} - Array de subtítulos agrupados
 */
function agruparPalabrasEnSubtitulos(words, maxPalabras = 3) {
  console.log(`📝 Agrupando palabras en subtítulos (máximo ${maxPalabras} palabras)...`);
  
  const subtitulos = [];
  
  for (let i = 0; i < words.length; i += maxPalabras) {
    const grupo = words.slice(i, Math.min(i + maxPalabras, words.length));
    
    subtitulos.push({
      texto: grupo.map(w => w.word).join(' '),
      inicio: grupo[0].start,
      fin: grupo[grupo.length - 1].end,
      palabras: grupo
    });
  }
  
  console.log(`✅ ${subtitulos.length} subtítulos generados`);
  return subtitulos;
}

/**
 * Formatear tiempo para archivo ASS
 * @param {number} segundos - Tiempo en segundos
 * @returns {string} - Tiempo formateado (H:MM:SS.CS)
 */
function formatearTiempoASS(segundos) {
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const segs = Math.floor(segundos % 60);
  const centesimas = Math.floor((segundos % 1) * 100);
  
  return `${horas}:${String(minutos).padStart(2, '0')}:${String(segs).padStart(2, '0')}.${String(centesimas).padStart(2, '0')}`;
}

/**
 * Generar archivo ASS con subtítulos estilo TikTok/Reels
 * @param {Array} subtitulos - Array de subtítulos
 * @param {string} rutaASS - Ruta donde guardar el archivo ASS
 * @returns {Promise<void>}
 */
async function generarArchivoASS(subtitulos, rutaASS) {
  console.log('🎨 Generando archivo de subtítulos ASS con estilo TikTok/Reels...');
  
  // Configuración de estilo TikTok/Reels
  const assHeader = `[Script Info]
Title: Subtítulos Estilo TikTok
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,85,&H00FFFFFF,&H000000FF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,180,1
Style: Highlight,Arial Black,95,&H0000FFFF,&H000000FF,&H00000000,&HA0000000,-1,0,0,0,115,115,0,0,1,5,3,2,40,40,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let dialogos = '';
  
  for (const sub of subtitulos) {
    const palabrasArray = sub.palabras;
    
    // Para cada palabra en el subtítulo
    for (let i = 0; i < palabrasArray.length; i++) {
      const palabra = palabrasArray[i];
      const inicioPalabra = formatearTiempoASS(palabra.start);
      const finPalabra = formatearTiempoASS(palabra.end);
      
      // Construir el texto con la palabra actual resaltada
      let textoConResaltado = '';
      
      for (let j = 0; j < palabrasArray.length; j++) {
        const palabraActual = palabrasArray[j].word.toUpperCase();
        
        if (j === i) {
          // Palabra activa: amarillo y más grande con animación
          textoConResaltado += `{\\c&H00FFFF&\\fscx115\\fscy115\\t(0,100,\\fscx120\\fscy120)}${palabraActual}{\\r}`;
        } else {
          // Palabras inactivas: blanco normal
          textoConResaltado += `{\\c&HFFFFFF&}${palabraActual}{\\r}`;
        }
        
        // Agregar espacio entre palabras (excepto la última)
        if (j < palabrasArray.length - 1) {
          textoConResaltado += ' ';
        }
      }
      
      // Agregar diálogo con fade in/out suave
      dialogos += `Dialogue: 0,${inicioPalabra},${finPalabra},Default,,0,0,0,,{\\fad(80,80)}${textoConResaltado}\n`;
    }
  }
  
  await fsPromises.writeFile(rutaASS, assHeader + dialogos, 'utf-8');
  console.log(`✅ Archivo ASS generado: ${rutaASS}`);
  console.log(`   Total de diálogos: ${dialogos.split('\n').length - 1}`);
}

// =============================================================================
// GENERACIÓN DE VIDEO
// =============================================================================

/**
 * Generar video con FFmpeg usando efecto Ken Burns y subtítulos
 * @param {Array} rutasImagenes - Array de rutas de imágenes ordenadas
 * @param {string} rutaAudio - Ruta del archivo de audio
 * @param {number} duracionPorImagen - Duración en segundos para cada imagen
 * @param {string} rutaSalida - Ruta del video de salida
 * @param {string} rutaASS - Ruta del archivo de subtítulos ASS (opcional)
 * @returns {Promise<string>} - Ruta del video generado
 */
function generarVideo(rutasImagenes, rutaAudio, duracionPorImagen, rutaSalida, rutaASS = null) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('🎬 Iniciando generación de video...');
      console.log(`   - Total de imágenes: ${rutasImagenes.length}`);
      console.log(`   - Duración por imagen: ${duracionPorImagen.toFixed(2)}s`);

      // Paso 1: Generar video base sin subtítulos
      const rutaVideoTemp = rutaASS ? rutaSalida.replace('.mp4', '_temp.mp4') : rutaSalida;
      
      // Crear filtros complejos para efecto Ken Burns
      const filtros = [];

      // Generar filtros Ken Burns para cada imagen
      rutasImagenes.forEach((ruta, index) => {
        const inputLabel = `[${index}:v]`;
        const outputLabel = `[v${index}]`;
        
        const duracionFrames = Math.floor(duracionPorImagen * 30);
        const mitadDuracion = duracionFrames / 2;
        
        // Fórmula de easing para transiciones super rápidas con zoom más dramático
        const filtro = `${inputLabel}scale=${VIDEO_CONFIG.width}:${VIDEO_CONFIG.height}:force_original_aspect_ratio=increase,crop=${VIDEO_CONFIG.width}:${VIDEO_CONFIG.height},zoompan=z='if(lte(on,${mitadDuracion}),1.5-0.5*(1-pow(1-on/${mitadDuracion},18)),1.0+0.5*pow((on-${mitadDuracion})/${mitadDuracion},18))':d=${duracionFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${VIDEO_CONFIG.width}x${VIDEO_CONFIG.height},fps=30,setpts=PTS-STARTPTS${outputLabel}`;
        
        filtros.push(filtro);
      });

      // Concatenar todos los clips
      const concatInputs = rutasImagenes.map((_, index) => `[v${index}]`).join('');
      filtros.push(`${concatInputs}concat=n=${rutasImagenes.length}:v=1:a=0[outv]`);

      const filterComplex = filtros.join(';');

      // Crear comando FFmpeg para video base
      let comando = ffmpeg();

      // Agregar todas las imágenes como inputs
      rutasImagenes.forEach(ruta => {
        comando = comando.input(ruta);
      });

      // Agregar audio
      comando = comando.input(rutaAudio);

      // Aplicar configuración
      await new Promise((resolveBase, rejectBase) => {
        comando
          .complexFilter(filterComplex)
          .outputOptions([
            '-map [outv]',
            `-map ${rutasImagenes.length}:a`,
            '-c:v ' + VIDEO_CONFIG.codec,
            '-preset ' + VIDEO_CONFIG.preset,
            '-crf ' + VIDEO_CONFIG.crf,
            '-pix_fmt ' + VIDEO_CONFIG.pixelFormat,
            '-c:a aac',
            '-b:a 192k',
            '-shortest'
          ])
          .output(rutaVideoTemp)
          .on('start', () => {
            console.log('🎥 Generando video base con efecto Ken Burns...');
          })
          .on('progress', (progress) => {
            if (progress.percent) {
              process.stdout.write(`\r⏳ Progreso video base: ${progress.percent.toFixed(1)}%`);
            }
          })
          .on('end', () => {
            console.log('\n✅ Video base generado');
            resolveBase();
          })
          .on('error', (error) => {
            console.error('\n❌ Error generando video base:', error.message);
            rejectBase(error);
          })
          .run();
      });

      // Paso 2: Si hay subtítulos, agregarlos al video
      if (rutaASS) {
        console.log('📝 Agregando subtítulos al video...');
        const rutaASSEscapada = rutaASS.replace(/\\/g, '/').replace(/:/g, '\\:');
        
        await new Promise((resolveSubs, rejectSubs) => {
          ffmpeg(rutaVideoTemp)
            .outputOptions([
              `-vf ass='${rutaASSEscapada}'`,
              '-c:a copy'
            ])
            .output(rutaSalida)
            .on('start', () => {
              console.log('🎨 Aplicando subtítulos...');
            })
            .on('progress', (progress) => {
              if (progress.percent) {
                process.stdout.write(`\r⏳ Progreso subtítulos: ${progress.percent.toFixed(1)}%`);
              }
            })
            .on('end', () => {
              console.log('\n✅ Subtítulos agregados');
              // Eliminar video temporal
              try {
                fs.unlinkSync(rutaVideoTemp);
              } catch (e) {
                console.warn('⚠️  No se pudo eliminar video temporal:', e.message);
              }
              resolveSubs();
            })
            .on('error', (error) => {
              console.error('\n❌ Error agregando subtítulos:', error.message);
              rejectSubs(error);
            })
            .run();
        });
      }

      console.log('✅ Video completo generado exitosamente');
      resolve(rutaSalida);
      
    } catch (error) {
      console.error('❌ Error en generarVideo:', error.message);
      reject(error);
    }
  });
}

// =============================================================================
// PROCESO PRINCIPAL
// =============================================================================

/**
 * Función principal que ejecuta todo el proceso
 */
async function procesarVideos() {
  console.log('\n' + '='.repeat(80));
  console.log('🎬 INICIANDO PROCESO DE GENERACIÓN DE VIDEOS');
  console.log('⏰ Timestamp:', new Date().toLocaleString('es-MX'));
  console.log('='.repeat(80) + '\n');

  try {
    // 1. Crear directorios necesarios
    crearDirectorios();

    // 2. Obtener guiones pendientes de producir video
    console.log('📋 Consultando guiones con estado "producir_video"...');
    const guiones = await obtenerGuionesPendientes();

    if (!guiones || guiones.length === 0) {
      console.log('⚠️  No se encontraron guiones pendientes de producir video');
      console.log('   (estado debe ser "producir_video")');
      return;
    }

    console.log(`✅ ${guiones.length} guion(es) pendiente(s) encontrado(s)`);
    console.log('');

    // 3. Procesar cada guion
    for (let i = 0; i < guiones.length; i++) {
      const guion = guiones[i];
      
      console.log('─'.repeat(80));
      console.log(`📹 PROCESANDO GUION ${i + 1}/${guiones.length}`);
      console.log(`   Nombre: ${guion.nombre}`);
      console.log(`   ID: ${guion.id}`);
      console.log('─'.repeat(80) + '\n');

      try {
        await procesarGuionIndividual(guion);
        console.log(`\n✅ Guion ${i + 1}/${guiones.length} procesado exitosamente\n`);
      } catch (error) {
        console.error(`\n❌ Error procesando guion ${guion.id}:`, error.message);
        console.error('   Continuando con el siguiente guion...\n');
        
        // Marcar guion con error
        await actualizarEstadoGuion(guion.id, 'error_produccion');
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('🎉 PROCESO COMPLETADO');
    console.log(`   Total procesados: ${guiones.length}`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR FATAL EN EL PROCESO:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Limpiar archivos temporales
    limpiarTemp();
  }
}

/**
 * Procesar un guion individual
 * @param {Object} guion - Objeto del guion a procesar
 */
async function procesarGuionIndividual(guion) {
  // Crear directorio temporal único para este guion
  const tempDirGuion = path.join(TEMP_DIR, `guion_${guion.id}_${Date.now()}`);
  
  try {
    // Crear directorio temporal único
    if (!fs.existsSync(tempDirGuion)) {
      fs.mkdirSync(tempDirGuion, { recursive: true });
    }
    
    // 1. Obtener media assets del guion
    console.log('🖼️  Consultando media assets...');
    let { imagenes, audio } = await obtenerMediaAssets(guion.id);

    // 4. Si no hay audio, generarlo con ElevenLabs
    if (!audio || !audio.url) {
      console.log('⚠️  No se encontró audio para este guion');
      console.log('🎙️  Generando audio automáticamente con ElevenLabs...');
      
      // Extraer texto del guion
      const textoParaNarrar = extraerTextoDelGuion(guion);
      
      if (!textoParaNarrar || textoParaNarrar.length === 0) {
        console.error('❌ ERROR: No se pudo extraer texto del guion para generar audio');
        console.error('   El guion debe tener: guion_detallado_json, prompt_generado o descripcion');
        return;
      }
      
      console.log(`📝 Texto extraído: ${textoParaNarrar.substring(0, 100)}...`);
      
      // Generar audio
      const audioGenerado = await generarAudioConElevenLabs(guion.id, textoParaNarrar);
      
      // Usar el audio recién generado
      audio = {
        id: audioGenerado.id,
        url: audioGenerado.url,
        tipo: 'audio',
        storage_path: audioGenerado.storage_path
      };
      
      console.log('✅ Audio generado y guardado exitosamente');
    } else {
      console.log(`✅ Audio encontrado: ${audio.url}`);
    }

    // 5. Validar que existan imágenes
    if (!imagenes || imagenes.length === 0) {
      console.error('❌ ERROR: No se encontraron imágenes para este guion');
      return;
    }
    console.log(`✅ ${imagenes.length} imágenes encontradas`);

    // 6. Ordenar imágenes por escena
    console.log('🔢 Ordenando imágenes por escena...');
    const imagenesOrdenadas = ordenarImagenesPorEscena(imagenes);
    console.log('✅ Imágenes ordenadas correctamente');

    // 7. Descargar audio
    console.log('⬇️  Descargando audio...');
    const rutaAudioLocal = path.join(tempDirGuion, `audio_${guion.id}.mp3`);
    await descargarArchivo(audio.url, rutaAudioLocal);
    console.log(`✅ Audio descargado: ${rutaAudioLocal}`);

    // 8. Obtener duración del audio
    console.log('⏱️  Obteniendo duración del audio...');
    const duracionAudio = await obtenerDuracionAudio(rutaAudioLocal);
    console.log(`✅ Duración del audio: ${duracionAudio.toFixed(2)} segundos`);

    // 9. Calcular duración por imagen
    const duracionPorImagen = duracionAudio / imagenesOrdenadas.length;
    console.log(`✅ Duración por imagen: ${duracionPorImagen.toFixed(2)} segundos`);

    // 10. Descargar todas las imágenes
    console.log('⬇️  Descargando imágenes...');
    const rutasImagenesLocales = [];

    for (let i = 0; i < imagenesOrdenadas.length; i++) {
      const imagen = imagenesOrdenadas[i];
      const escena = imagen.metadata?.escena || 'sin_escena';
      const rutaLocal = path.join(tempDirGuion, `imagen_${i}_escena_${escena}.jpg`);
      
      await descargarArchivo(imagen.url, rutaLocal);
      rutasImagenesLocales.push(rutaLocal);
      console.log(`   ✓ Imagen ${i + 1}/${imagenesOrdenadas.length} descargada (escena ${escena})`);
    }

    console.log('✅ Todas las imágenes descargadas');

    // 11. Transcribir audio con Whisper
    console.log('\n📝 === GENERANDO SUBTÍTULOS ===');
    const palabras = await transcribirAudioConWhisper(rutaAudioLocal);
    
    // 12. Agrupar palabras en subtítulos (1-3 palabras estilo TikTok)
    const subtitulos = agruparPalabrasEnSubtitulos(palabras, 3);
    
    // 13. Generar archivo ASS con subtítulos
    const rutaASS = path.join(tempDirGuion, `subtitulos_${guion.id}.ass`);
    await generarArchivoASS(subtitulos, rutaASS);

    // 14. Generar video con subtítulos
    console.log('\n🎬 === GENERANDO VIDEO CON SUBTÍTULOS ===');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nombreVideo = `video_${guion.id}_${timestamp}.mp4`;
    const rutaVideoSalida = path.join(EXPORTS_DIR, nombreVideo);

    await generarVideo(
      rutasImagenesLocales,
      rutaAudioLocal,
      duracionPorImagen,
      rutaVideoSalida,
      rutaASS
    );

    console.log(`\n✅ VIDEO GENERADO LOCALMENTE: ${rutaVideoSalida}`);

    // 15. Subir video a Supabase Storage
    console.log('\n📤 === SUBIENDO VIDEO A SUPABASE ===');
    const { storage_path, url, size_bytes } = await subirVideoAStorage(rutaVideoSalida, guion.id);

    // 16. Registrar video en la tabla videos
    console.log('\n💾 === REGISTRANDO VIDEO EN BASE DE DATOS ===');
    const videoRegistrado = await registrarVideoEnDB(
      guion,
      storage_path,
      url,
      size_bytes,
      duracionAudio
    );

    console.log(`\n✅ Video registrado en tabla 'videos':`);
    console.log(`   ID: ${videoRegistrado.id}`);
    console.log(`   Estado: ${videoRegistrado.estado}`);
    console.log(`   URL: ${videoRegistrado.video_url}`);

    // 17. Actualizar estado del guion a "video_producido"
    await actualizarEstadoGuion(guion.id, 'video_producido');

    // 18. Limpiar archivos temporales de este guion
    console.log('🧹 Limpiando archivos temporales del guion...');
    if (fs.existsSync(tempDirGuion)) {
      await fsPromises.rm(tempDirGuion, { recursive: true, force: true });
      console.log('✅ Archivos temporales del guion eliminados');
    }

  } catch (error) {
    console.error('\n❌ ERROR EN PROCESAMIENTO DEL GUION:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Intentar limpiar archivos temporales incluso si hay error
    console.log('🧹 Limpiando archivos temporales del guion (tras error)...');
    if (fs.existsSync(tempDirGuion)) {
      try {
        await fsPromises.rm(tempDirGuion, { recursive: true, force: true });
        console.log('✅ Archivos temporales eliminados');
      } catch (cleanError) {
        console.error('⚠️  Error al limpiar archivos temporales:', cleanError.message);
      }
    }
    
    throw error; // Re-lanzar para que el proceso principal lo maneje
  }
}

// =============================================================================
// CONFIGURACIÓN DEL CRON
// =============================================================================

/**
 * Configurar tareas programadas con cron
 */
function iniciarCron() {
  console.log('🚀 Iniciando servicios automatizados...');
  console.log('⌨️  Presiona Ctrl+C para detener los servicios\n');

  // Cron 1: Generación de videos - cada 10 minutos
  cron.schedule('*/10 * * * *', () => {
    procesarVideos();
  });
  console.log('✅ Cron job 1: Generación de videos (cada 10 minutos)');

  // Cron 2: Programación de publicaciones - cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    programarPublicaciones();
  });
  console.log('✅ Cron job 2: Programación de publicaciones (cada 5 minutos)');

  // Cron 3: Publicación en redes sociales - cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    publicarEnRedesSociales();
  });
  console.log('✅ Cron job 3: Publicación en redes sociales (cada 5 minutos)');

  console.log('\n⏳ Esperando próximas ejecuciones...\n');
}

// =============================================================================
// EJECUCIÓN
// =============================================================================

// Ejecutar procesos iniciales (opcional, comentar si no se desea)
console.log('🔄 Ejecutando procesos iniciales...\n');

// Ejecutar generación de videos
procesarVideos().then(() => {
  console.log('');
  // Después de procesar videos, ejecutar programación
  return programarPublicaciones();
}).catch(error => {
  console.error('Error en procesos iniciales:', error);
});

// Iniciar los cron jobs
iniciarCron();

// Mantener el proceso vivo
process.on('SIGINT', () => {
  console.log('\n\n👋 Deteniendo servicio de generación de videos...');
  limpiarTemp();
  console.log('✅ Servicio detenido correctamente');
  process.exit(0);
});
