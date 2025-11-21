/**
 * Script de generación automática de videos
 * Ejecuta cada 10 minutos mediante cron para procesar el último guion creado
 * y generar un video con imágenes ordenadas, efecto Ken Burns y audio
 */

const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configurar rutas de FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// =============================================================================
// CONFIGURACIÓN
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Validar variables de entorno
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERROR: Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY');
  process.exit(1);
}

// Inicializar cliente de Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Directorios
const TEMP_DIR = path.join(__dirname, 'temp');
const EXPORTS_DIR = path.join(__dirname, 'exports');

// Configuración de video
const VIDEO_CONFIG = {
  width: 1920,
  height: 1080,
  codec: 'libx264',
  preset: 'medium',
  crf: 23,
  pixelFormat: 'yuv420p'
};

// Configuración efecto Ken Burns
const KEN_BURNS = {
  zoomStart: 1.0,
  zoomEnd: 1.2
};

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

// =============================================================================
// CONSULTAS A SUPABASE
// =============================================================================

/**
 * Obtener el último guion creado
 * @returns {Promise<Object|null>} - Objeto del guion o null
 */
async function obtenerUltimoGuion() {
  try {
    const { data, error } = await supabase
      .from('guiones')
      .select('id, nombre, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('❌ Error al obtener último guion:', error.message);
    return null;
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
// GENERACIÓN DE VIDEO
// =============================================================================

/**
 * Generar video con FFmpeg usando efecto Ken Burns
 * @param {Array} rutasImagenes - Array de rutas de imágenes ordenadas
 * @param {string} rutaAudio - Ruta del archivo de audio
 * @param {number} duracionPorImagen - Duración en segundos para cada imagen
 * @param {string} rutaSalida - Ruta del video de salida
 * @returns {Promise<string>} - Ruta del video generado
 */
function generarVideo(rutasImagenes, rutaAudio, duracionPorImagen, rutaSalida) {
  return new Promise((resolve, reject) => {
    console.log('🎬 Iniciando generación de video...');
    console.log(`   - Total de imágenes: ${rutasImagenes.length}`);
    console.log(`   - Duración por imagen: ${duracionPorImagen.toFixed(2)}s`);

    // Crear filtros complejos para efecto Ken Burns
    const filtros = [];
    const inputs = [];

    // Agregar cada imagen como input
    rutasImagenes.forEach((ruta, index) => {
      inputs.push(ruta);
    });

    // Generar filtros Ken Burns para cada imagen
    // Alternar entre zoom-in (inicio) y zoom-out (final)
    rutasImagenes.forEach((ruta, index) => {
      const inputLabel = `[${index}:v]`;
      const outputLabel = `[v${index}]`;
      
      // Zoom in al inicio, zoom out al final de cada imagen
      const zoomInicio = KEN_BURNS.zoomStart;
      const zoomFinal = KEN_BURNS.zoomEnd;
      
      // Escalar y aplicar zoom con movimiento suave
      const filtro = `${inputLabel}scale=${VIDEO_CONFIG.width}:${VIDEO_CONFIG.height}:force_original_aspect_ratio=increase,crop=${VIDEO_CONFIG.width}:${VIDEO_CONFIG.height},zoompan=z='if(lte(on,${Math.floor(duracionPorImagen * 30 / 2)}),zoom+0.002,zoom-0.002)':d=${Math.floor(duracionPorImagen * 30)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${VIDEO_CONFIG.width}x${VIDEO_CONFIG.height},fps=30,setpts=PTS-STARTPTS${outputLabel}`;
      
      filtros.push(filtro);
    });

    // Concatenar todos los clips
    const concatInputs = rutasImagenes.map((_, index) => `[v${index}]`).join('');
    filtros.push(`${concatInputs}concat=n=${rutasImagenes.length}:v=1:a=0[outv]`);

    const filterComplex = filtros.join(';');

    // Crear comando FFmpeg
    let comando = ffmpeg();

    // Agregar todas las imágenes como inputs
    rutasImagenes.forEach(ruta => {
      comando = comando.input(ruta);
    });

    // Agregar audio
    comando = comando.input(rutaAudio);

    // Aplicar configuración
    comando
      .complexFilter(filterComplex)
      .outputOptions([
        '-map [outv]',
        `-map ${rutasImagenes.length}:a`, // Mapear el audio (último input)
        '-c:v ' + VIDEO_CONFIG.codec,
        '-preset ' + VIDEO_CONFIG.preset,
        '-crf ' + VIDEO_CONFIG.crf,
        '-pix_fmt ' + VIDEO_CONFIG.pixelFormat,
        '-c:a aac',
        '-b:a 192k',
        '-shortest' // Terminar cuando el stream más corto termine
      ])
      .output(rutaSalida)
      .on('start', (commandLine) => {
        console.log('🎥 Comando FFmpeg ejecutado');
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r⏳ Progreso: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log('\n✅ Video generado exitosamente');
        resolve(rutaSalida);
      })
      .on('error', (error) => {
        console.error('\n❌ Error en FFmpeg:', error.message);
        reject(error);
      })
      .run();
  });
}

// =============================================================================
// PROCESO PRINCIPAL
// =============================================================================

/**
 * Función principal que ejecuta todo el proceso
 */
async function procesarVideo() {
  console.log('\n' + '='.repeat(80));
  console.log('🎬 INICIANDO PROCESO DE GENERACIÓN DE VIDEO');
  console.log('⏰ Timestamp:', new Date().toLocaleString('es-MX'));
  console.log('='.repeat(80) + '\n');

  try {
    // 1. Crear directorios necesarios
    crearDirectorios();

    // 2. Obtener último guion
    console.log('📋 Consultando último guion...');
    const guion = await obtenerUltimoGuion();

    if (!guion) {
      console.log('⚠️  No se encontraron guiones en la base de datos');
      return;
    }

    console.log(`✅ Guion encontrado: ${guion.nombre} (ID: ${guion.id})`);

    // 3. Obtener media assets del guion
    console.log('🖼️  Consultando media assets...');
    const { imagenes, audio } = await obtenerMediaAssets(guion.id);

    // 4. Validar que exista audio
    if (!audio || !audio.url) {
      console.error('❌ ERROR: No se encontró archivo de audio para este guion');
      return;
    }
    console.log(`✅ Audio encontrado: ${audio.url}`);

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
    const rutaAudioLocal = path.join(TEMP_DIR, `audio_${guion.id}.mp3`);
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
      const rutaLocal = path.join(TEMP_DIR, `imagen_${i}_escena_${escena}.jpg`);
      
      await descargarArchivo(imagen.url, rutaLocal);
      rutasImagenesLocales.push(rutaLocal);
      console.log(`   ✓ Imagen ${i + 1}/${imagenesOrdenadas.length} descargada (escena ${escena})`);
    }

    console.log('✅ Todas las imágenes descargadas');

    // 11. Generar video
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nombreVideo = `video_${guion.id}_${timestamp}.mp4`;
    const rutaVideoSalida = path.join(EXPORTS_DIR, nombreVideo);

    await generarVideo(
      rutasImagenesLocales,
      rutaAudioLocal,
      duracionPorImagen,
      rutaVideoSalida
    );

    console.log(`\n✅ VIDEO GENERADO EXITOSAMENTE: ${rutaVideoSalida}`);

    // 12. Limpiar archivos temporales
    limpiarTemp();

    console.log('\n' + '='.repeat(80));
    console.log('🎉 PROCESO COMPLETADO EXITOSAMENTE');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR FATAL EN EL PROCESO:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Intentar limpiar archivos temporales incluso si hay error
    limpiarTemp();
  }
}

// =============================================================================
// CONFIGURACIÓN DEL CRON
// =============================================================================

/**
 * Configurar tarea programada con cron
 * Se ejecuta cada 10 minutos
 */
function iniciarCron() {
  console.log('🚀 Iniciando servicio de generación de videos...');
  console.log('⏰ Configurado para ejecutarse cada 10 minutos');
  console.log('⌨️  Presiona Ctrl+C para detener el servicio\n');

  // Cron pattern: cada 10 minutos
  // Formato: minuto hora día mes día-semana
  cron.schedule('*/10 * * * *', () => {
    procesarVideo();
  });

  console.log('✅ Cron job configurado exitosamente');
  console.log('⏳ Esperando próxima ejecución...\n');
}

// =============================================================================
// EJECUCIÓN
// =============================================================================

// Ejecutar inmediatamente al iniciar (opcional, comentar si no se desea)
console.log('🔄 Ejecutando proceso inicial...');
procesarVideo();

// Iniciar el cron job
iniciarCron();

// Mantener el proceso vivo
process.on('SIGINT', () => {
  console.log('\n\n👋 Deteniendo servicio de generación de videos...');
  limpiarTemp();
  console.log('✅ Servicio detenido correctamente');
  process.exit(0);
});
