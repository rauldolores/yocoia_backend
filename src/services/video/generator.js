const ffmpeg = require('fluent-ffmpeg');
const { supabase, openai } = require('../../config');
const { VIDEO_CONFIG, COLOR_GRADING, KEN_BURNS, PATRONES_PAN } = require('../../config');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

/**
 * Detectar si un archivo es video
 * @param {string} rutaArchivo - Ruta del archivo
 * @returns {boolean}
 */
function esVideo(rutaArchivo) {
  const extension = path.extname(rutaArchivo).toLowerCase();
  return ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.m4v'].includes(extension);
}

/**
 * Detectar si un archivo es imagen
 * @param {string} rutaArchivo - Ruta del archivo
 * @returns {boolean}
 */
function esImagen(rutaArchivo) {
  const extension = path.extname(rutaArchivo).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(extension);
}

/**
 * Obtener duración de un video
 * @param {string} rutaVideo - Ruta del video
 * @returns {Promise<number>} - Duración en segundos
 */
async function obtenerDuracionVideo(rutaVideo) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(rutaVideo, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata.format.duration || 0);
      }
    });
  });
}

/**
 * Generar video con FFmpeg usando efecto Ken Burns, panning y color grading
 * Soporta mezcla de videos e imágenes
 * @param {Array} rutasMedias - Array de rutas de imágenes/videos ordenadas
 * @param {string} rutaAudio - Ruta del archivo de audio
 * @param {number} duracionPorSegmento - Duración base en segundos para cada segmento
 * @param {string} rutaSalida - Ruta del video de salida
 * @param {string} rutaASS - Ruta del archivo de subtítulos ASS (opcional)
 * @param {Object} opciones - Opciones adicionales (formato16x9, musicaVolumen, etc)
 * @returns {Promise<string>} - Ruta del video generado
 */
async function generarVideo(rutasMedias, rutaAudio, duracionPorSegmento, rutaSalida, rutaASS = null, opciones = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('\n🔍 === INFORMACIÓN DE DEPURACIÓN ===');
      console.log('🎬 Iniciando generación de video con soporte de videos e imágenes...');
      console.log(`   - Total de medias: ${rutasMedias.length}`);
      console.log(`   - Duración base por segmento: ${duracionPorSegmento.toFixed(2)}s`);
      
      // Configuración de video - Soportar formato 16:9 para videos largos
      const fps = VIDEO_CONFIG.fps || 30;
      const formato16x9 = opciones.formato16x9 || false;
      const width = formato16x9 ? 1920 : (VIDEO_CONFIG.width || 1080);
      const height = formato16x9 ? 1080 : (VIDEO_CONFIG.height || 1920);
      
      console.log(`   - Formato: ${formato16x9 ? '16:9 (1920x1080)' : '9:16 (1080x1920)'}`);
      
      // Obtener duración del audio primero
      console.log('🎵 Obteniendo duración del audio...');
      const duracionAudio = await obtenerDuracionVideo(rutaAudio);
      console.log(`   - Duración del audio: ${duracionAudio.toFixed(2)}s`);
      
      // Analizar cada media y determinar su duración real
      const mediasInfo = [];
      for (let i = 0; i < rutasMedias.length; i++) {
        const rutaMedia = rutasMedias[i];
        const info = {
          ruta: rutaMedia,
          esVideo: esVideo(rutaMedia),
          esImagen: esImagen(rutaMedia),
          duracionSegmento: duracionPorSegmento,
          necesitaRecorte: false
        };

        if (info.esVideo) {
          try {
            const duracionOriginal = await obtenerDuracionVideo(rutaMedia);
            // Estrategia híbrida: usar duración original si <= duracionPorSegmento, sino recortar
            info.duracionSegmento = Math.min(duracionOriginal, duracionPorSegmento);
            info.necesitaRecorte = duracionOriginal > duracionPorSegmento;
            console.log(`   [${i}] 🎥 VIDEO: ${path.basename(rutaMedia)}`);
            console.log(`       Duración original: ${duracionOriginal.toFixed(2)}s`);
            console.log(`       Duración a usar: ${info.duracionSegmento.toFixed(2)}s ${info.necesitaRecorte ? '(recortado)' : '(completo)'}`);
          } catch (error) {
            console.error(`       ⚠️ Error al obtener duración:`, error.message);
            // Si falla, usar duración base
            info.duracionSegmento = duracionPorSegmento;
          }
        } else if (info.esImagen) {
          console.log(`   [${i}] 🖼️  IMAGEN: ${path.basename(rutaMedia)}`);
          console.log(`       Duración inicial: ${duracionPorSegmento}s`);
        }

        mediasInfo.push(info);
      }
      
      // Calcular duración total de videos y medias
      const duracionTotalInicial = mediasInfo.reduce((sum, m) => sum + m.duracionSegmento, 0);
      const diferencia = duracionAudio - duracionTotalInicial;
      
      console.log(`   - Duración total inicial de medias: ${duracionTotalInicial.toFixed(2)}s`);
      console.log(`   - Diferencia con audio: ${diferencia.toFixed(2)}s`);
      
      // Si hay diferencia, ajustar solo las imágenes proporcionalmente
      if (Math.abs(diferencia) > 0.1) {
        const imagenes = mediasInfo.filter(m => m.esImagen);
        if (imagenes.length > 0) {
          const ajustePorImagen = diferencia / imagenes.length;
          console.log(`   - Ajustando ${imagenes.length} imágenes en ${ajustePorImagen.toFixed(2)}s cada una`);
          
          imagenes.forEach(img => {
            img.duracionSegmento += ajustePorImagen;
            // Asegurar que no sea negativa
            if (img.duracionSegmento < 0.5) img.duracionSegmento = 0.5;
          });
        }
      }
      
      const duracionTotalFinal = mediasInfo.reduce((sum, m) => sum + m.duracionSegmento, 0);
      console.log(`   - Duración total ajustada: ${duracionTotalFinal.toFixed(2)}s`);
      console.log(`   - Coincide con audio: ${Math.abs(duracionTotalFinal - duracionAudio) < 0.1 ? '✅ SÍ' : '⚠️  NO'}`);
      
      // Verificar archivos de media
      console.log('\n📁 Verificando archivos de media:');
      for (let i = 0; i < mediasInfo.length; i++) {
        const info = mediasInfo[i];
        const existe = fs.existsSync(info.ruta);
        if (!existe) {
          console.error(`   [${i}] ❌ NO EXISTE: ${info.ruta}`);
          throw new Error(`Archivo no encontrado: ${info.ruta}`);
        }
        
        const stats = fs.statSync(info.ruta);
        const tipo = info.esVideo ? '🎥 VIDEO' : '🖼️  IMAGEN';
        console.log(`   [${i}] ✅ ${tipo}: ${path.basename(info.ruta)} (${(stats.size / 1024).toFixed(2)} KB)`);
        
        // Obtener metadata usando ffprobe
        try {
          const probe = await new Promise((res, rej) => {
            ffmpeg.ffprobe(info.ruta, (err, metadata) => {
              if (err) rej(err);
              else res(metadata);
            });
          });
          const videoStream = probe.streams.find(s => s.codec_type === 'video');
          if (videoStream) {
            console.log(`       Resolución: ${videoStream.width}x${videoStream.height}`);
            console.log(`       Codec: ${videoStream.codec_name}`);
          }
        } catch (probeErr) {
          console.warn(`       ⚠️  No se pudo obtener metadata: ${probeErr.message}`);
        }
      }
      
      // Verificar audio
      console.log('\n🎵 Verificando audio:');
      const audioExiste = fs.existsSync(rutaAudio);
      if (audioExiste) {
        const audioStats = fs.statSync(rutaAudio);
        console.log(`   ✅ ${path.basename(rutaAudio)} (${(audioStats.size / 1024).toFixed(2)} KB)`);
        
        try {
          const audioProbe = await new Promise((res, rej) => {
            ffmpeg.ffprobe(rutaAudio, (err, metadata) => {
              if (err) rej(err);
              else res(metadata);
            });
          });
          const audioStream = audioProbe.streams.find(s => s.codec_type === 'audio');
          if (audioStream) {
            console.log(`   Duración: ${audioProbe.format.duration}s`);
            console.log(`   Codec: ${audioStream.codec_name}`);
            console.log(`   Sample rate: ${audioStream.sample_rate} Hz`);
            console.log(`   Channels: ${audioStream.channels}`);
            console.log(`   Bitrate: ${audioProbe.format.bit_rate ? (audioProbe.format.bit_rate / 1000).toFixed(0) : 'N/A'} kbps`);
          }
        } catch (probeErr) {
          console.warn(`   ⚠️  No se pudo obtener metadata de audio: ${probeErr.message}`);
        }
      } else {
        console.error(`   ❌ NO EXISTE: ${rutaAudio}`);
        throw new Error(`Audio no encontrado: ${rutaAudio}`);
      }
      
      if (rutaASS) {
        console.log('\n📝 Archivo de subtítulos:');
        const assExiste = fs.existsSync(rutaASS);
        if (assExiste) {
          const assStats = fs.statSync(rutaASS);
          console.log(`   ✅ ${path.basename(rutaASS)} (${(assStats.size / 1024).toFixed(2)} KB)`);
        } else {
          console.warn(`   ⚠️  NO EXISTE: ${rutaASS}`);
        }
      }
      
      console.log('\n🎬 === INICIANDO GENERACIÓN ===\n');

      // Paso 1: Generar video base sin subtítulos
      const rutaVideoTemp = rutaASS ? rutaSalida.replace('.mp4', '_temp.mp4') : rutaSalida;
      
      // Crear filtros complejos para efecto Ken Burns
      const filtros = [];

      // Generar filtros para cada media (Ken Burns para imágenes, scale+crop para videos)
      mediasInfo.forEach((info, index) => {
        const inputLabel = `[${index}:v]`;
        const outputLabel = `[v${index}]`;
        
        if (info.esImagen) {
          const duracionFrames = Math.floor(info.duracionSegmento * fps);
          
          if (formato16x9) {
            // VIDEOS LARGOS (16:9): Paneo horizontal puro sin zoom
            // Alternamos dirección: izquierda→derecha, derecha→izquierda
            const direccion = index % 2 === 0 ? 'L->R' : 'R->L';
            console.log(`   🖼️  Imagen ${index + 1}: Paneo horizontal ${direccion} (${info.duracionSegmento.toFixed(2)}s)`);
            
            // Usar tblend + overlay para simular movimiento, o mejor: loop + crop animado
            // Primero necesitamos convertir imagen estática en video con loop
            
            const anchoEscalado = width * 2; // 3840 para paneo
            const distanciaMovimiento = Math.round(width * 0.33); // 33% del ancho = 640px (paneo más lento y sutil)
            
            // Expresión de crop con 'n' (frame number) para movimiento
            let cropX;
            if (index % 2 === 0) {
              // Izquierda → Derecha: x = n * (640 / total_frames)
              cropX = `'min(n*${distanciaMovimiento / duracionFrames},${distanciaMovimiento})'`;
            } else {
              // Derecha → Izquierda: x = 640 - n * (640 / total_frames)
              cropX = `'max(${distanciaMovimiento}-n*${distanciaMovimiento / duracionFrames},0)'`;
            }
            
            // Filtro completo:
            // 1. scale + crop: preparar imagen a 3840x1080
            // 2. loop: convertir imagen estática en video de N frames
            // 3. crop: recorte animado usando 'n' para coordenada X
            // 4. fps, setsar, setpts: normalización
            const filtro = `${inputLabel}scale=${anchoEscalado}:${height}:force_original_aspect_ratio=increase,crop=${anchoEscalado}:${height},loop=loop=${duracionFrames}:size=1:start=0,crop=${width}:${height}:${cropX}:0,fps=${fps},setsar=1,setpts=PTS-STARTPTS${outputLabel}`;
            
            filtros.push(filtro);
          } else {
            // VIDEOS CORTOS (9:16): Aplicar Ken Burns con zoompan
            const mitadDuracion = duracionFrames / 2;
            
            // Seleccionar patrón de paneo según el índice (se repite cada 4 medias)
            const patron = PATRONES_PAN[index % PATRONES_PAN.length];
            console.log(`   🖼️  Imagen ${index + 1}: Ken Burns + Paneo ${patron.nombre} (${info.duracionSegmento.toFixed(2)}s)`);
            
            // Calcular movimiento de paneo con easing suave (ease-in-out)
            // Usa pow(3) para distribuir mejor el movimiento durante toda la duración
            let paneoX, paneoY;
            
            if (patron.factorX !== undefined) {
              // Paneo horizontal con easing muy pronunciado (pow 8)
              const inicio = patron.factorX;
              const rango = Math.abs(patron.factorX) * 2;
              
              paneoX = `iw/2-(iw/zoom/2) + iw*${inicio}*(1-1/zoom) + iw*${rango}*${patron.direccionX}*(1-1/zoom)*if(lte(on,${mitadDuracion}),(1-pow(1-on/${mitadDuracion},8)),pow((on-${mitadDuracion})/${mitadDuracion},8))`;
              paneoY = `ih/2-(ih/zoom/2)`;
            } else {
              // Paneo vertical con easing muy pronunciado (pow 8)
              const inicio = patron.factorY;
              const rango = Math.abs(patron.factorY) * 2;
              
              paneoX = `iw/2-(iw/zoom/2)`;
              paneoY = `ih/2-(ih/zoom/2) + ih*${inicio}*(1-1/zoom) + ih*${rango}*${patron.direccionY}*(1-1/zoom)*if(lte(on,${mitadDuracion}),(1-pow(1-on/${mitadDuracion},8)),pow((on-${mitadDuracion})/${mitadDuracion},8))`;
            }
            
            // Fórmula de zoom con easing ease-in-out (pow 8)
            // Zoom OUT (1.7x → 1.0x) primera mitad, Zoom IN (1.0x → 1.7x) segunda mitad
            // El pow(8) distribuye: ~90% movimiento en primeros/últimos 15%, muy estático en el medio
            const filtro = `${inputLabel}scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,zoompan=z='if(lte(on,${mitadDuracion}),1.7-0.7*(1-pow(1-on/${mitadDuracion},8)),1.0+0.7*pow((on-${mitadDuracion})/${mitadDuracion},8))':d=${duracionFrames}:x='${paneoX}':y='${paneoY}':s=${width}x${height},fps=${fps},setpts=PTS-STARTPTS${outputLabel}`;
            
            filtros.push(filtro);
          }
        } else if (info.esVideo) {
          // VIDEOS: Solo scale, crop y normalización (sin zoompan para preservar movimiento)
          console.log(`   🎥 Video ${index + 1}: Scale + Crop (preservando movimiento) (${info.duracionSegmento.toFixed(2)}s)`);
          
          // Para videos: scale, crop, normalizar fps y setsar
          const filtro = `${inputLabel}scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},setpts=PTS-STARTPTS${outputLabel}`;
          
          filtros.push(filtro);
        }
      });

      // Concatenar todos los clips
      const concatInputs = mediasInfo.map((_, index) => `[v${index}]`).join('');
      filtros.push(`${concatInputs}concat=n=${mediasInfo.length}:v=1:a=0[v_concat]`);
      
      // Aplicar Color Grading
      console.log('🎨 Aplicando color grading profesional...');
      filtros.push(`[v_concat]eq=saturation=${COLOR_GRADING.saturation}:brightness=${COLOR_GRADING.brightness}:contrast=${COLOR_GRADING.contrast}[outv]`);

      const filterComplex = filtros.join(';');

      // Crear comando FFmpeg para video base
      let comando = ffmpeg();

      // Agregar todas las medias como inputs
      // Para imágenes: el zoompan maneja la duración con el parámetro 'd'
      // Para videos: aplicamos -t si necesitan recorte
      mediasInfo.forEach(info => {
        if (info.esImagen) {
          // Imágenes: agregar sin opciones, zoompan controla la duración
          comando = comando.input(info.ruta);
        } else if (info.esVideo) {
          // Videos: si necesita recorte, aplicar -t para duración
          if (info.necesitaRecorte) {
            comando = comando.input(info.ruta).inputOptions(['-t', info.duracionSegmento.toString()]);
          } else {
            comando = comando.input(info.ruta);
          }
        }
      });

      // Agregar audio
      comando = comando.input(rutaAudio);

      // Aplicar configuración
      await new Promise((resolveBase, rejectBase) => {
        comando
          .complexFilter(filterComplex)
          .outputOptions([
            '-map [outv]',
            `-map ${mediasInfo.length}:a`,
            '-c:v ' + VIDEO_CONFIG.codec,
            '-preset ' + VIDEO_CONFIG.preset,
            '-crf ' + VIDEO_CONFIG.crf,
            '-pix_fmt ' + VIDEO_CONFIG.pixelFormat,
            '-c:a aac',
            '-b:a 192k',
            `-t ${duracionAudio.toFixed(3)}`
          ])
          .output(rutaVideoTemp)
          .on('start', (commandLine) => {
            console.log('🎥 Generando video base con efecto Ken Burns...');
            console.log('\n🔧 Comando FFmpeg completo:');
            console.log(commandLine);
            console.log('');
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
          .on('error', (error, stdout, stderr) => {
            console.error('\n❌ Error generando video base:', error.message);
            console.error('\n📋 STDERR de FFmpeg:');
            console.error(stderr || 'No stderr disponible');
            console.error('\n📋 STDOUT de FFmpeg:');
            console.error(stdout || 'No stdout disponible');
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

module.exports = {
  generarVideo
};
