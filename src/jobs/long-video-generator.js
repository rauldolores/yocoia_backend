/**
 * Job: Generador de Videos Largos
 * 
 * Genera videos largos segmento por segmento y los une en un video final.
 * Solo procesa guiones con tipo_guion = 'video_largo' y estado = 'producir_video'
 */

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { TEMP_DIR, EXPORTS_DIR, supabase } = require('../config');
const { obtenerFechaMexico } = require('../utils/date');
const { crearDirectorios, limpiarTemp, descargarArchivo, obtenerDuracionAudio } = require('../utils/file');
const { generarVideo } = require('../services/video');
const { subirVideoAStorage } = require('../database/storage');
const { reportarError, TipoError, Severidad } = require('../services/heartbeat');
const { notificarInicioVideoLargo, notificarVideoLargoCompletado, notificarError } = require('../services/telegram');
const ffmpeg = require('fluent-ffmpeg');

// Lock para evitar ejecuciones concurrentes
let isProcessingLongVideos = false;

/**
 * Obtener guiones largos pendientes de producir video
 */
async function obtenerGuionesLargosPendientes() {
  try {
    const { data, error } = await supabase
      .from('guiones')
      .select(`
        id,
        canal_id,
        nombre,
        titulo,
        descripcion,
        tipo_contenido,
        canales!inner (
          id,
          nombre,
          musica_fondo_youtube_url,
          generacion_automatica
        )
      `)
      .eq('tipo_contenido', 'video_largo')
      .eq('estado', 'producir_video')
      .eq('canales.generacion_automatica', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('❌ Error al obtener guiones largos pendientes:', error.message);
    return [];
  }
}

/**
 * Obtener secciones de un guion ordenadas
 */
async function obtenerSeccionesGuion(guionId) {
  try {
    const { data, error } = await supabase
      .from('secciones_guion')
      .select('*')
      .eq('guion_id', guionId)
      .order('orden', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('❌ Error al obtener secciones del guion:', error.message);
    throw error;
  }
}

/**
 * Obtener media assets de una sección
 */
async function obtenerMediaAssetsSeccion(guionId, seccionId) {
  try {
    const { data, error } = await supabase
      .from('media_assets')
      .select('id, tipo, url, metadata, storage_path')
      .eq('guion_id', guionId)
      .eq('seccion_id', seccionId)
      .in('tipo', ['imagen', 'audio']);

    if (error) throw error;

    const imagenes = data?.filter(item => item.tipo === 'imagen') || [];
    const audio = data?.find(item => item.tipo === 'audio');

    return { imagenes, audio };
  } catch (error) {
    console.error('❌ Error al obtener media assets de sección:', error.message);
    throw error;
  }
}

/**
 * Ordenar imágenes por número de segmento
 */
function ordenarImagenesPorSegmento(imagenes) {
  return imagenes.sort((a, b) => {
    const segmentoA = a.metadata?.segmento_numero;
    const segmentoB = b.metadata?.segmento_numero;

    if (segmentoA === undefined || segmentoA === null) {
      console.warn(`⚠️  Imagen ${a.id} no tiene metadata.segmento_numero, se colocará al final`);
      return 1;
    }
    if (segmentoB === undefined || segmentoB === null) {
      console.warn(`⚠️  Imagen ${b.id} no tiene metadata.segmento_numero, se colocará al final`);
      return -1;
    }

    return segmentoA - segmentoB;
  });
}

/**
 * Descargar música de fondo desde YouTube
 */
async function descargarMusicaFondo(youtubeUrl, tempDir) {
  // Por ahora retornamos null, esto se puede implementar con youtube-dl o similar
  // El generarVideo puede manejar música opcional
  console.log(`   🎵 Música de fondo: ${youtubeUrl || 'No configurada'}`);
  return null;
}

/**
 * Generar video de una sección individual
 */
async function generarVideoSeccion(guion, seccion, tempDirGuion) {
  const seccionNum = seccion.orden;
  console.log(`\n   📹 Procesando sección ${seccionNum}: ${seccion.titulo}`);
  console.log(`      🔍 DEBUG - video_url: ${seccion.video_url || 'null'}`);
  console.log(`      🔍 DEBUG - storage_path: ${seccion.storage_path || 'null'}`);

  // Verificar si ya existe video generado para esta sección
  if (seccion.video_url && seccion.storage_path) {
    console.log(`      ♻️  Video ya existe en BD, descargando...`);
    console.log(`      🔗 URL: ${seccion.video_url}`);
    
    try {
      // Crear subdirectorio para esta sección
      const tempDirSeccion = path.join(tempDirGuion, `seccion_${seccionNum}`);
      if (!fs.existsSync(tempDirSeccion)) {
        fs.mkdirSync(tempDirSeccion, { recursive: true });
      }

      // Descargar video existente
      const nombreVideoSeccion = `seccion_${seccionNum.toString().padStart(3, '0')}.mp4`;
      const outputPath = path.join(tempDirSeccion, nombreVideoSeccion);
      await descargarArchivo(seccion.video_url, outputPath);
      
      console.log(`      ✅ Video de sección reutilizado (${seccionNum})`);
      return outputPath;
    } catch (error) {
      console.warn(`      ⚠️  No se pudo descargar video existente, regenerando...`);
      console.warn(`      Error: ${error.message}`);
      // Continuar con la generación normal si falla la descarga
    }
  }

  // Crear subdirectorio para esta sección
  const tempDirSeccion = path.join(tempDirGuion, `seccion_${seccionNum}`);
  if (!fs.existsSync(tempDirSeccion)) {
    fs.mkdirSync(tempDirSeccion, { recursive: true });
  }

  try {
    // 1. Obtener media assets de la sección
    console.log('      🖼️  Obteniendo media assets...');
    const { imagenes, audio } = await obtenerMediaAssetsSeccion(guion.id, seccion.id);

    // 2. Validar audio
    if (!audio || !audio.url) {
      throw new Error(`Sección ${seccionNum} no tiene audio generado`);
    }
    console.log(`      ✅ Audio encontrado: ${audio.url}`);

    // 3. Validar imágenes
    if (!imagenes || imagenes.length === 0) {
      throw new Error(`Sección ${seccionNum} no tiene imágenes generadas`);
    }
    console.log(`      ✅ ${imagenes.length} imágenes encontradas`);

    // 4. Descargar audio
    console.log('      ⬇️  Descargando audio...');
    const audioPath = await descargarArchivo(audio.url, path.join(tempDirSeccion, 'audio.mp3'));
    
    // 5. Obtener duración del audio
    const duracionAudio = await obtenerDuracionAudio(audioPath);
    console.log(`      ⏱️  Duración del audio: ${duracionAudio.toFixed(2)}s`);

    // 6. Calcular duración por imagen
    const duracionPorImagen = duracionAudio / imagenes.length;
    console.log(`      🖼️  Duración por imagen: ${duracionPorImagen.toFixed(2)}s`);

    // 7. Ordenar imágenes por segmento_numero
    const imagenesOrdenadas = ordenarImagenesPorSegmento(imagenes);

    // 8. Descargar imágenes
    console.log('      ⬇️  Descargando imágenes...');
    const rutasImagenes = [];
    for (let i = 0; i < imagenesOrdenadas.length; i++) {
      const imagen = imagenesOrdenadas[i];
      const nombreArchivo = `imagen_${i + 1}.jpg`;
      const imagenPath = await descargarArchivo(imagen.url, path.join(tempDirSeccion, nombreArchivo));
      rutasImagenes.push(imagenPath);
    }

    // 9. Descargar música de fondo (opcional)
    const musicaPath = await descargarMusicaFondo(guion.canales?.musica_fondo_youtube_url, tempDirSeccion);

    // 10. Generar video de la sección
    console.log('      🎬 Generando video de la sección...');
    console.log(`      📐 Formato: 16:9 (1920x1080)`);
    console.log(`      🎵 Música al 10% de volumen`);
    console.log(`      🎨 Paneo continuo por ${duracionPorImagen.toFixed(2)}s por imagen`);
    
    const nombreVideoSeccion = `seccion_${seccionNum.toString().padStart(3, '0')}.mp4`;
    const outputPath = path.join(tempDirSeccion, nombreVideoSeccion);

    // Generar video con la firma correcta: (rutasMedias, rutaAudio, duracionPorSegmento, rutaSalida, rutaASS, opciones)
    await generarVideo(
      rutasImagenes,      // Array de rutas de imágenes
      audioPath,          // Ruta del audio
      duracionPorImagen,  // Duración que cada imagen debe mostrarse (el paneo durará todo este tiempo)
      outputPath,         // Ruta de salida
      null,               // Sin subtítulos para videos largos
      {
        formato16x9: true,    // Formato 16:9 (1920x1080) para videos largos
        musicaVolumen: 0.10   // 10% de volumen para música de fondo
      }
    );

    console.log(`      ✅ Video de sección generado: ${outputPath}`);
    return outputPath;

  } catch (error) {
    console.error(`      ❌ Error generando sección ${seccionNum}:`, error.message);
    throw error;
  }
}

/**
 * Generar imagen de título de sección con NanoBanana
 */
async function generarImagenTituloSeccion(guion, seccion, numeroSeccion, tempDir) {
  const apiBaseUrl = process.env.API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('API_BASE_URL no configurado');
  }

  console.log(`      🎨 Generando imagen de título: "${seccion.titulo}"...`);

  // Construir prompt con el formato especificado
  const prompt = `Generate a cinematic chapter title card image to be used as a transition between video segments.

MAIN TEXT (mandatory):
"${seccion.titulo.toUpperCase()}"

TEXT STYLE:
- All caps
- Clean, modern sans-serif font
- Bold weight
- White color
- Centered both horizontally and vertically
- Slight soft glow around the text
- High contrast against background
- Professional documentary style
- Font must look similar to Netflix or Apple TV documentary titles

SMALL TEXT ABOVE:
"SECCIÓN ${numeroSeccion}" - IMPORTANT: Use the exact spelling "SECCIÓN" with double 'C' and accent on 'O'. - Do not spell it as "SECION".
- Smaller size
- Same font family
- Subtle opacity

BACKGROUND:
- Real photographic image related to the theme of "${seccion.titulo}"
- Strong blur applied (heavy blur, background must not be recognizable)
- Grayscale or near black-and-white
- Darkened overall tone
- Soft vignette around the edges
- Subtle film grain texture
- No readable text or symbols in the background
- 16:9 aspect ratio

COMPOSITION:
- 16:9 aspect ratio
- Minimalist
- Calm and serious mood
- Designed specifically as a video chapter separator
- Timeless, elegant, authoritative

STRICT RULES: - Spelling must be perfect: "SECCIÓN" (double C).
- No illustrations
- No cartoons
- No bright or saturated colors
- No decorative, handwritten, or playful fonts
- No logos
- No watermarks
- No busy or sharp background details
- No color accents

FINAL STYLE KEYWORDS:
cinematic, documentary, minimalist, serious, professional, elegant, transition screen`;

  const response = await fetch(`${apiBaseUrl}/nanobanana/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guion_id: guion.id,
      escena: `titulo_seccion_${numeroSeccion}`,
      prompt: prompt
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const imageUrl = data.asset.url;

  console.log(`      ✅ Imagen generada: ${imageUrl}`);

  // Descargar imagen localmente
  const imagePath = path.join(tempDir, `titulo_seccion_${numeroSeccion}.jpg`);
  await descargarArchivo(imageUrl, imagePath);

  return imagePath;
}

/**
 * Convertir imagen de título a video estático de 2 segundos
 */
async function convertirImagenATituloVideo(imagePath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`      🎬 Convirtiendo imagen a video (2s)...`);

    ffmpeg()
      .input(imagePath)
      .inputOptions([
        '-loop 1',           // Loop la imagen
        '-t 2'               // Duración de 2 segundos
      ])
      .input('anullsrc=r=44100:cl=stereo')  // Generar audio silencioso
      .inputOptions([
        '-f lavfi',          // Usar filtro de audio virtual
        '-t 2'               // Duración de 2 segundos
      ])
      .outputOptions([
        '-vf scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1', // 16:9 con padding
        '-c:v libx264',      // Codec H.264
        '-c:a aac',          // Codec de audio
        '-b:a 192k',         // Bitrate de audio (mismo que los videos de sección)
        '-ar 44100',         // Sample rate (mismo que los videos de sección)
        '-pix_fmt yuv420p',  // Formato de pixel compatible
        '-r 30',             // 30 fps
        '-shortest'          // Terminar cuando el input más corto termine
      ])
      .output(outputPath)
      .on('start', (cmd) => {
        console.log(`      ▶️  Comando FFmpeg: ${cmd}`);
      })
      .on('end', () => {
        console.log(`      ✅ Video de título creado (con audio silencioso): ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`      ❌ Error al convertir imagen a video:`, err.message);
        reject(err);
      })
      .run();
  });
}

/**
 * Unir videos de secciones en video final
 */
async function unirVideosEnFinal(videosSeccionesPath, outputPath, secciones, guion, tempDir) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('\n   🎨 Generando títulos de secciones...');
      
      // Generar videos de título para cada sección
      const videosConTitulos = [];
      
      for (let i = 0; i < secciones.length; i++) {
        const seccion = secciones[i];
        const numeroSeccion = i + 1;
        
        // 1. Generar imagen de título
        const imagenTituloPath = await generarImagenTituloSeccion(
          guion,
          seccion,
          numeroSeccion,
          tempDir
        );
        
        // 2. Convertir imagen a video de 2 segundos
        const videoTituloPath = path.join(tempDir, `titulo_seccion_${numeroSeccion}.mp4`);
        await convertirImagenATituloVideo(imagenTituloPath, videoTituloPath);
        
        // 3. Agregar título y luego video de la sección
        videosConTitulos.push(videoTituloPath);
        videosConTitulos.push(videosSeccionesPath[i]);
        
        console.log(`      ✅ Sección ${numeroSeccion}: Título + Video listos`);
      }
      
      console.log('\n   🔗 Uniendo títulos y videos de secciones...');
      console.log(`   📹 Total de segmentos: ${videosConTitulos.length} (${secciones.length} títulos + ${secciones.length} videos)`);

      // Crear archivo de lista para FFmpeg
      const listPath = path.join(tempDir, 'videos_list.txt');
      const listContent = videosConTitulos.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(listPath, listContent);

      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c:v libx264',      // Recodificar video para compatibilidad
          '-preset fast',      // Preset rápido
          '-crf 23',           // Calidad constante
          '-c:a aac',          // Codec de audio
          '-b:a 192k',         // Bitrate de audio
          '-ar 44100'          // Sample rate
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          console.log('   ▶️  Comando FFmpeg:', cmd);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            process.stdout.write(`\r   ⏳ Progreso unión: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log('\n   ✅ Videos unidos exitosamente');
          // Limpiar archivo temporal
          try {
            fs.unlinkSync(listPath);
          } catch (e) {
            // Ignorar error de limpieza
          }
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('\n   ❌ Error al unir videos:', err.message);
          reject(err);
        })
        .run();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Actualizar sección con video generado
 */
async function actualizarSeccionConVideo(seccionId, videoUrl, storagePath) {
  try {
    const { error } = await supabase
      .from('secciones_guion')
      .update({
        video_url: videoUrl,
        storage_path: storagePath,
        estado: 'completado',
        updated_at: new Date().toISOString()
      })
      .eq('id', seccionId);

    if (error) throw error;
    console.log(`      ✅ Sección actualizada con video generado`);
  } catch (error) {
    console.error('      ❌ Error al actualizar sección:', error.message);
    throw error;
  }
}

/**
 * Actualizar sección con información del video generado
 */
async function actualizarSeccionConVideo(seccionId, videoUrl, storagePath) {
  try {
    const { error } = await supabase
      .from('secciones_guion')
      .update({
        video_url: videoUrl,
        storage_path: storagePath,
        updated_at: new Date().toISOString()
      })
      .eq('id', seccionId);

    if (error) throw error;
    console.log(`      ✅ Sección actualizada con video en BD`);
  } catch (error) {
    console.error('      ❌ Error al actualizar sección:', error.message);
    throw error;
  }
}

/**
 * Actualizar estado del guion
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
    console.log(`   ✅ Estado del guion actualizado a: ${nuevoEstado}`);
  } catch (error) {
    console.error('   ❌ Error al actualizar estado del guion:', error.message);
    throw error;
  }
}

/**
 * Registrar video final en base de datos
 */
async function registrarVideoEnDB(guion, videoStoragePath, videoUrl, videoSizeBytes, duracionSegundos) {
  try {
    // Verificar si ya existe un video para este guion
    const { data: videoExistente, error: errorCheck } = await supabase
      .from('videos')
      .select('id')
      .eq('guion_id', guion.id)
      .single();

    if (errorCheck && errorCheck.code !== 'PGRST116') {
      throw errorCheck;
    }

    if (videoExistente) {
      // Actualizar video existente
      const { data, error } = await supabase
        .from('videos')
        .update({
          video_url: videoUrl,
          video_storage_path: videoStoragePath,
          duracion_segundos: Math.round(duracionSegundos),
          video_size_bytes: videoSizeBytes,
          estado: 'pendiente_publicar',
          metadata: {
            tipo_video: 'largo',
            fecha_produccion: obtenerFechaMexico(),
            canal: guion.canales?.nombre
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', videoExistente.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Crear nuevo video
      const tituloTexto = typeof guion.titulo === 'string' 
        ? guion.titulo 
        : guion.titulo?.texto || guion.nombre;

      const { data, error } = await supabase
        .from('videos')
        .insert({
          guion_id: guion.id,
          video_url: videoUrl,
          video_storage_path: videoStoragePath,
          titulo: tituloTexto,
          descripcion: guion.descripcion || '',
          duracion_segundos: Math.round(duracionSegundos),
          video_size_bytes: videoSizeBytes,
          estado: 'pendiente_publicar',
          metadata: {
            tipo_video: 'largo',
            fecha_produccion: obtenerFechaMexico(),
            canal: guion.canales?.nombre
          }
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('❌ Error al registrar video en DB:', error.message);
    throw error;
  }
}

/**
 * Procesar un guion largo individual
 */
async function procesarGuionLargo(guion) {
  const tempDirGuion = path.join(TEMP_DIR, `guion_largo_${guion.id}_${Date.now()}`);
  const videosSeccionesPath = [];

  try {
    console.log('\n' + '═'.repeat(80));
    console.log(`📹 PROCESANDO GUION LARGO: ${guion.nombre}`);
    console.log(`   ID: ${guion.id}`);
    console.log(`   Canal: ${guion.canales?.nombre || 'Sin canal'}`);
    console.log('═'.repeat(80));

    // Crear directorio temporal
    if (!fs.existsSync(tempDirGuion)) {
      fs.mkdirSync(tempDirGuion, { recursive: true });
    }

    // 1. Obtener secciones del guion
    console.log('\n📋 Obteniendo secciones del guion...');
    const secciones = await obtenerSeccionesGuion(guion.id);

    if (!secciones || secciones.length === 0) {
      throw new Error('El guion no tiene secciones definidas');
    }

    console.log(`✅ ${secciones.length} secciones encontradas`);

    // Notificar inicio a Telegram
    await notificarInicioVideoLargo({
      canal: guion.canales?.nombre || 'Sin canal',
      titulo: guion.nombre,
      numSecciones: secciones.length
    });

    // 2. Generar video de cada sección
    console.log('\n🎬 Generando videos por sección...');
    let duracionTotalSegundos = 0;

    for (const seccion of secciones) {
      const videoSeccionPath = await generarVideoSeccion(guion, seccion, tempDirGuion);
      videosSeccionesPath.push(videoSeccionPath);

      // Obtener duración de la sección
      const duracionSeccion = await obtenerDuracionAudio(videoSeccionPath);
      duracionTotalSegundos += duracionSeccion;

      // Solo subir si no existe video_url (si fue regenerado)
      if (!seccion.video_url || !seccion.storage_path) {
        console.log('      ☁️  Subiendo video de sección a storage...');
        const storageFolder = `videos_largos/${guion.canal_id}/${guion.id}/secciones`;
        const nombreArchivo = `seccion_${seccion.orden}_${Date.now()}.mp4`;
        const { url: urlSeccion, path: pathSeccion } = await subirVideoAStorage(
          videoSeccionPath,
          storageFolder,
          nombreArchivo
        );

        // Actualizar sección con video generado
        await actualizarSeccionConVideo(seccion.id, urlSeccion, pathSeccion);
      } else {
        console.log('      ✅ Video de sección ya está en storage, no se resubió');
      }
    }

    console.log(`\n✅ Todas las secciones generadas (${secciones.length})`);
    console.log(`⏱️  Duración total estimada: ${duracionTotalSegundos.toFixed(2)}s (sin contar títulos)`);

    // 3. Unir videos en video final (con títulos de sección)
    const videoFinalPath = path.join(tempDirGuion, `video_final_${guion.id}.mp4`);
    await unirVideosEnFinal(videosSeccionesPath, videoFinalPath, secciones, guion, tempDirGuion);

    // 4. Validar que el video final existe y calcular duración real
    if (!fs.existsSync(videoFinalPath)) {
      throw new Error('No se pudo generar el video final');
    }

    // Calcular duración real del video final (incluye títulos de 2s cada uno)
    const duracionTitulos = secciones.length * 2; // 2 segundos por título
    const duracionFinalTotal = duracionTotalSegundos + duracionTitulos;
    
    const videoStats = fs.statSync(videoFinalPath);
    const videoSizeMB = (videoStats.size / (1024 * 1024)).toFixed(2);
    console.log(`\n✅ Video final generado:`);
    console.log(`   📁 Tamaño: ${videoSizeMB} MB`);
    console.log(`   ⏱️  Duración secciones: ${duracionTotalSegundos.toFixed(2)}s`);
    console.log(`   🎨 Duración títulos: ${duracionTitulos}s (${secciones.length} títulos × 2s)`);
    console.log(`   ⏱️  Duración total: ${duracionFinalTotal.toFixed(2)}s`);

    // 5. Subir video final a storage
    console.log('\n☁️  Subiendo video final a storage...');
    const storageFolder = `videos_largos/${guion.canal_id}`;
    const nombreArchivo = `${guion.id}_${Date.now()}.mp4`;
    const { url: videoUrl, path: storagePath } = await subirVideoAStorage(
      videoFinalPath,
      storageFolder,
      nombreArchivo
    );

    console.log(`✅ Video subido a storage: ${videoUrl}`);

    // 6. Registrar video en base de datos
    console.log('\n💾 Registrando video en base de datos...');
    await registrarVideoEnDB(
      guion,
      storagePath,
      videoUrl,
      videoStats.size,
      duracionFinalTotal
    );

    // 7. Actualizar estado del guion
    await actualizarEstadoGuion(guion.id, 'video_producido');

    // Notificar finalización a Telegram
    await notificarVideoLargoCompletado({
      canal: guion.canales?.nombre || 'Sin canal',
      titulo: guion.nombre,
      duracion: duracionFinalTotal,
      tamanoMB: videoSizeMB
    });

    console.log('\n' + '═'.repeat(80));
    console.log('✅ GUION LARGO PROCESADO EXITOSAMENTE');
    console.log('═'.repeat(80) + '\n');

    return { success: true };

  } catch (error) {
    console.error('\n❌ ERROR AL PROCESAR GUION LARGO:', error.message);
    console.error('Stack:', error.stack);

    // Notificar error a Telegram
    await notificarError({
      tipo: 'generacion_video',
      mensaje: 'Error al procesar video largo',
      contexto: `Canal: ${guion.canales?.nombre || 'Sin canal'} - Guion: ${guion.nombre}`,
      error: error
    });

    await reportarError({
      tipo: TipoError.PROCESSING,
      severidad: Severidad.ERROR,
      mensaje: `Error al procesar guion largo: ${guion.nombre}`,
      error: error,
      canalId: guion.canal_id,
      contexto: {
        guion_id: guion.id,
        guion_nombre: guion.nombre,
        tipo: 'video_largo'
      }
    });

    // Intentar actualizar estado a error
    try {
      await actualizarEstadoGuion(guion.id, 'error_produccion');
    } catch (e) {
      console.error('❌ No se pudo actualizar estado a error:', e.message);
    }

    return { success: false, error: error.message };

  } finally {
    // Limpiar directorio temporal
    try {
      console.log('\n🧹 Limpiando archivos temporales...');
      await limpiarTemp(tempDirGuion);
      console.log('✅ Limpieza completada');
    } catch (error) {
      console.error('⚠️  Error al limpiar archivos temporales:', error.message);
    }
  }
}

/**
 * Proceso principal: Generar videos largos
 */
async function procesarVideosLargos() {
  if (isProcessingLongVideos) {
    console.log('\n⏸️  Generación de videos largos ya en progreso, omitiendo...\n');
    return;
  }

  isProcessingLongVideos = true;

  try {
    console.log('\n' + '='.repeat(80));
    console.log('🎬 GENERACIÓN DE VIDEOS LARGOS');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('='.repeat(80));

    // Obtener guiones largos pendientes
    const guiones = await obtenerGuionesLargosPendientes();

    if (guiones.length === 0) {
      console.log('\n⚠️  No hay guiones largos pendientes de producir\n');
      return;
    }

    console.log(`\n📋 Guiones largos a procesar: ${guiones.length}`);
    guiones.forEach(g => console.log(`   • ${g.nombre} (${g.canales?.nombre || 'Sin canal'})`));

    // Procesar cada guion
    let procesados = 0;
    let exitosos = 0;
    let errores = 0;

    for (const guion of guiones) {
      const resultado = await procesarGuionLargo(guion);
      procesados++;

      if (resultado.success) {
        exitosos++;
      } else {
        errores++;
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(80));
    console.log('✅ GENERACIÓN DE VIDEOS LARGOS COMPLETADA');
    console.log(`   Guiones procesados: ${procesados}`);
    console.log(`   Exitosos: ${exitosos}`);
    console.log(`   Con errores: ${errores}`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR EN GENERACIÓN DE VIDEOS LARGOS:', error.message);
    console.error('Stack:', error.stack);

    await reportarError({
      tipo: TipoError.PROCESSING,
      severidad: Severidad.CRITICAL,
      mensaje: 'Error en proceso de generación de videos largos',
      error: error
    });
  } finally {
    isProcessingLongVideos = false;
  }
}

module.exports = {
  procesarVideosLargos
};
