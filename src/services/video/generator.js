const ffmpeg = require('fluent-ffmpeg');
const { supabase, openai } = require('../../config');
const { VIDEO_CONFIG, COLOR_GRADING, KEN_BURNS, PATRONES_PAN } = require('../../config');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

/**
 * Generar video con FFmpeg usando efecto Ken Burns, panning y color grading
 * @param {Array} rutasImagenes - Array de rutas de imágenes ordenadas
 * @param {string} rutaAudio - Ruta del archivo de audio
 * @param {number} duracionPorImagen - Duración en segundos para cada imagen
 * @param {string} rutaSalida - Ruta del video de salida
 * @param {string} rutaASS - Ruta del archivo de subtítulos ASS (opcional)
 * @returns {Promise<string>} - Ruta del video generado
 */
async function generarVideo(rutasImagenes, rutaAudio, duracionPorImagen, rutaSalida, rutaASS = null) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('\n🔍 === INFORMACIÓN DE DEPURACIÓN ===');
      console.log('🎬 Iniciando generación de video...');
      console.log(`   - Total de imágenes: ${rutasImagenes.length}`);
      console.log(`   - Duración por imagen: ${duracionPorImagen.toFixed(2)}s`);
      console.log(`   - Duración total estimada: ${(rutasImagenes.length * duracionPorImagen).toFixed(2)}s`);
      
      // Verificar imágenes
      console.log('\n📸 Verificando imágenes:');
      for (let i = 0; i < rutasImagenes.length; i++) {
        const ruta = rutasImagenes[i];
        const existe = fs.existsSync(ruta);
        if (existe) {
          const stats = fs.statSync(ruta);
          console.log(`   [${i}] ✅ ${path.basename(ruta)} (${(stats.size / 1024).toFixed(2)} KB)`);
          
          // Intentar obtener dimensiones de la imagen usando ffprobe
          try {
            const probe = await new Promise((res, rej) => {
              ffmpeg.ffprobe(ruta, (err, metadata) => {
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
        } else {
          console.error(`   [${i}] ❌ NO EXISTE: ${ruta}`);
          throw new Error(`Imagen no encontrada: ${ruta}`);
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

      // Generar filtros Ken Burns para cada imagen
      rutasImagenes.forEach((ruta, index) => {
        const inputLabel = `[${index}:v]`;
        const outputLabel = `[v${index}]`;
        
        const duracionFrames = Math.floor(duracionPorImagen * 30);
        const mitadDuracion = duracionFrames / 2;
        
        // Seleccionar patrón de paneo según el índice (se repite cada 4 imágenes)
        const patron = PATRONES_PAN[index % PATRONES_PAN.length];
        console.log(`   📹 Imagen ${index + 1}: Ken Burns + Paneo ${patron.nombre}`);
        
        // Calcular movimiento de paneo con easing
        let paneoX, paneoY;
        
        if (patron.factorX !== undefined) {
          // Paneo horizontal
          const inicio = patron.factorX;
          const rango = Math.abs(patron.factorX) * 2;
          
          paneoX = `iw/2-(iw/zoom/2) + iw*${inicio}*(1-1/zoom) + iw*${rango}*${patron.direccionX}*(1-1/zoom)*if(lte(on,${mitadDuracion}),(1-pow(1-on/${mitadDuracion},18)),pow((on-${mitadDuracion})/${mitadDuracion},18))`;
          paneoY = `ih/2-(ih/zoom/2)`;
        } else {
          // Paneo vertical
          const inicio = patron.factorY;
          const rango = Math.abs(patron.factorY) * 2;
          
          paneoX = `iw/2-(iw/zoom/2)`;
          paneoY = `ih/2-(ih/zoom/2) + ih*${inicio}*(1-1/zoom) + ih*${rango}*${patron.direccionY}*(1-1/zoom)*if(lte(on,${mitadDuracion}),(1-pow(1-on/${mitadDuracion},18)),pow((on-${mitadDuracion})/${mitadDuracion},18))`;
        }
        
        // Fórmula de easing para transiciones super rápidas con zoom más dramático
        // setsar=1 fuerza un SAR consistente (1:1) para evitar errores en concat
        const filtro = `${inputLabel}scale=${VIDEO_CONFIG.width}:${VIDEO_CONFIG.height}:force_original_aspect_ratio=increase,crop=${VIDEO_CONFIG.width}:${VIDEO_CONFIG.height},setsar=1,zoompan=z='if(lte(on,${mitadDuracion}),1.7-0.7*(1-pow(1-on/${mitadDuracion},18)),1.0+0.7*pow((on-${mitadDuracion})/${mitadDuracion},18))':d=${duracionFrames}:x='${paneoX}':y='${paneoY}':s=${VIDEO_CONFIG.width}x${VIDEO_CONFIG.height},fps=30,setpts=PTS-STARTPTS${outputLabel}`;
        
        filtros.push(filtro);
      });

      // Concatenar todos los clips
      const concatInputs = rutasImagenes.map((_, index) => `[v${index}]`).join('');
      filtros.push(`${concatInputs}concat=n=${rutasImagenes.length}:v=1:a=0[v_concat]`);
      
      // Aplicar Color Grading
      console.log('🎨 Aplicando color grading profesional...');
      filtros.push(`[v_concat]eq=saturation=${COLOR_GRADING.saturation}:brightness=${COLOR_GRADING.brightness}:contrast=${COLOR_GRADING.contrast}[outv]`);

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
