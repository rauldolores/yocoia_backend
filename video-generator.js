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

// Validar variables de entorno
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
 * Obtener el último guion creado
 * @returns {Promise<Object|null>} - Objeto del guion o null
 */
async function obtenerUltimoGuion() {
  try {
    const { data, error } = await supabase
      .from('guiones')
      .select('id, nombre, created_at, guion_detallado_json, prompt_generado, descripcion')
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
    // Inicio: Zoom out (1.3 → 1.0) empieza rápido y frena gradualmente
    // Final: Zoom in (1.0 → 1.3) empieza lento y acelera gradualmente
    rutasImagenes.forEach((ruta, index) => {
      const inputLabel = `[${index}:v]`;
      const outputLabel = `[v${index}]`;
      
      const duracionFrames = Math.floor(duracionPorImagen * 30);
      const mitadDuracion = duracionFrames / 2;
      
      // Fórmula de easing para transiciones super rápidas con zoom más dramático
      // Primera mitad: zoom out de 1.5 a 1.0 (ease-out: SUPER rápido→lento)
      //   Usa 1-pow(1-t, 18) para desaceleración super pronunciada
      // Segunda mitad: zoom in de 1.0 a 1.5 (ease-in: lento→SUPER rápido)
      //   Usa pow(t, 18) para aceleración super pronunciada
      const filtro = `${inputLabel}scale=${VIDEO_CONFIG.width}:${VIDEO_CONFIG.height}:force_original_aspect_ratio=increase,crop=${VIDEO_CONFIG.width}:${VIDEO_CONFIG.height},zoompan=z='if(lte(on,${mitadDuracion}),1.5-0.5*(1-pow(1-on/${mitadDuracion},18)),1.0+0.5*pow((on-${mitadDuracion})/${mitadDuracion},18))':d=${duracionFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${VIDEO_CONFIG.width}x${VIDEO_CONFIG.height},fps=30,setpts=PTS-STARTPTS${outputLabel}`;
      
      filtros.push(filtro);
    });

    // Concatenar todos los clips
    const concatInputs = rutasImagenes.map((_, index) => `[v${index}]`).join('');
    filtros.push(`${concatInputs}concat=n=${rutasImagenes.length}:v=1:a=0[videobase]`);
    
    // Si hay archivo de subtítulos, agregarlo
    if (rutaASS) {
      // Escapar la ruta para FFmpeg (convertir \ a / y escapar :)
      const rutaASSEscapada = rutaASS.replace(/\\/g, '/').replace(/:/g, '\\:');
      filtros.push(`[videobase]ass='${rutaASSEscapada}'[outv]`);
      console.log(`   - Subtítulos: ${rutaASS}`);
    } else {
      // Si no hay subtítulos, renombrar salida
      filtros[filtros.length - 1] = filtros[filtros.length - 1].replace('[videobase]', '[outv]');
    }

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

    // 11. Transcribir audio con Whisper
    console.log('\n📝 === GENERANDO SUBTÍTULOS ===');
    const palabras = await transcribirAudioConWhisper(rutaAudioLocal);
    
    // 12. Agrupar palabras en subtítulos (1-3 palabras estilo TikTok)
    const subtitulos = agruparPalabrasEnSubtitulos(palabras, 3);
    
    // 13. Generar archivo ASS con subtítulos
    const rutaASS = path.join(TEMP_DIR, `subtitulos_${guion.id}.ass`);
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
