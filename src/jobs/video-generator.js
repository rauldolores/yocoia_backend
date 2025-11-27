const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { TEMP_DIR, EXPORTS_DIR } = require('../config');
const { obtenerFechaMexico } = require('../utils/date');
const { crearDirectorios, limpiarTemp, descargarArchivo, obtenerDuracionAudio } = require('../utils/file');
const { generarAudioConElevenLabs, extraerTextoDelGuion } = require('../services/audio');
const { generarVideo, transcribirAudioConWhisper, agruparPalabrasEnSubtitulos, generarArchivoASS } = require('../services/video');
const { 
  obtenerGuionesPendientes, 
  obtenerMediaAssets, 
  subirVideoAStorage, 
  registrarVideoEnDB,
  actualizarEstadoGuion 
} = require('../database');

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
    let { imagenes, videos, medias, audio } = await obtenerMediaAssets(guion.id);

    // 2. Si no hay audio, generarlo con ElevenLabs
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

    // 3. Validar que existan medias (imágenes o videos)
    if (!medias || medias.length === 0) {
      console.error('❌ ERROR: No se encontraron imágenes ni videos para este guion');
      return;
    }
    console.log(`✅ ${imagenes.length} imágenes y ${videos.length} videos encontrados (${medias.length} medias totales)`);

    // 4. Ordenar medias por escena
    console.log('🔢 Ordenando medias por escena...');
    const mediasOrdenadas = ordenarImagenesPorEscena(medias);
    console.log(`✅ Orden establecido: ${mediasOrdenadas.length} medias`);

    // 5. Descargar audio
    console.log('⬇️  Descargando audio...');
    const rutaAudioLocal = path.join(tempDirGuion, `audio_${guion.id}.mp3`);
    await descargarArchivo(audio.url, rutaAudioLocal);
    console.log(`✅ Audio descargado: ${rutaAudioLocal}`);

    // 6. Obtener duración del audio
    console.log('⏱️  Obteniendo duración del audio...');
    const duracionAudio = await obtenerDuracionAudio(rutaAudioLocal);
    console.log(`✅ Duración del audio: ${duracionAudio.toFixed(2)} segundos`);

    // 7. Calcular duración base por segmento
    const duracionPorSegmento = duracionAudio / mediasOrdenadas.length;
    console.log(`✅ Duración base por segmento: ${duracionPorSegmento.toFixed(2)} segundos`);

    // 8. Descargar todas las medias (imágenes y videos)
    console.log('⬇️  Descargando medias...');
    const rutasMediasLocales = [];

    for (let i = 0; i < mediasOrdenadas.length; i++) {
      const media = mediasOrdenadas[i];
      const escena = media.metadata?.escena || 'sin_escena';
      const extension = media.tipo === 'video' ? 'mp4' : 'jpg';
      const rutaLocal = path.join(tempDirGuion, `${media.tipo}_${i}_escena_${escena}.${extension}`);
      
      await descargarArchivo(media.url, rutaLocal);
      rutasMediasLocales.push(rutaLocal);
      console.log(`   ✓ ${media.tipo} ${i + 1}/${mediasOrdenadas.length} descargado (escena ${escena})`);
    }

    console.log('✅ Todas las medias descargadas');

    // 9. Transcribir audio con Whisper
    console.log('\n📝 === GENERANDO SUBTÍTULOS ===');
    const palabras = await transcribirAudioConWhisper(rutaAudioLocal);
    
    // 10. Agrupar palabras en subtítulos (1-3 palabras estilo TikTok)
    const subtitulos = agruparPalabrasEnSubtitulos(palabras, 3);
    
    // 11. Generar archivo ASS con subtítulos
    const rutaASS = path.join(tempDirGuion, `subtitulos_${guion.id}.ass`);
    await generarArchivoASS(subtitulos, rutaASS);

    // 12. Generar video con subtítulos
    // Nota: generarVideo() ahora soporta mezcla de imágenes y videos
    // Aplica Ken Burns a ambos tipos, con duración híbrida para videos
    console.log('\n🎬 === GENERANDO VIDEO CON SUBTÍTULOS ===');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nombreVideo = `video_${guion.id}_${timestamp}.mp4`;
    const rutaVideoSalida = path.join(EXPORTS_DIR, nombreVideo);

    await generarVideo(
      rutasMediasLocales, // Ahora soporta imágenes (.jpg, .png) y videos (.mp4, .mov, etc)
      rutaAudioLocal,
      duracionPorSegmento,
      rutaVideoSalida,
      rutaASS
    );

    console.log(`\n✅ VIDEO GENERADO LOCALMENTE: ${rutaVideoSalida}`);

    // 13. Subir video a Supabase Storage
    console.log('\n📤 === SUBIENDO VIDEO A SUPABASE ===');
    const { storage_path, url, size_bytes } = await subirVideoAStorage(rutaVideoSalida, guion.id);

    // 14. Registrar video en la tabla videos
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

    // 15. Eliminar video de exports (ya está en Supabase)
    console.log('\n🧹 Eliminando video de carpeta exports...');
    if (fs.existsSync(rutaVideoSalida)) {
      fs.unlinkSync(rutaVideoSalida);
      console.log('✅ Video eliminado de exports');
    }

    // 16. Actualizar estado del guion a "video_producido"
    await actualizarEstadoGuion(guion.id, 'video_producido');

    // 17. Limpiar archivos temporales de este guion
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

/**
 * Función principal que ejecuta todo el proceso de generación de videos
 */
async function procesarVideos() {
  console.log('\n' + '='.repeat(80));
  console.log('🎬 INICIANDO PROCESO DE GENERACIÓN DE VIDEOS');
  console.log('⏰ Timestamp México:', obtenerFechaMexico().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));
  console.log('='.repeat(80) + '\n');

  try {
    // 1. Crear directorios necesarios
    crearDirectorios();

    // 2. Obtener guiones pendientes de producir video
    // IMPORTANTE: Este cron procesa TODOS los canales, no respeta el filtro
    console.log('📋 Consultando guiones con estado "producir_video" (TODOS LOS CANALES)...');
    const filtroDeshabilitado = { enabled: false, channels: { ids: [], names: [] } };
    const guiones = await obtenerGuionesPendientes(filtroDeshabilitado);

    if (!guiones || guiones.length === 0) {
      console.log('⚠️  No se encontraron guiones pendientes de producir video');
      console.log('   (estado debe ser "producir_video")');
      return;
    }

    console.log(`✅ ${guiones.length} guion(es) pendiente(s) encontrado(s) en todos los canales`);
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

module.exports = {
  procesarVideos
};
