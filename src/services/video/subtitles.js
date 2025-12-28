const { openai } = require('../../config');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { obtenerFuenteAleatoria } = require('../../utils/fonts');

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
  
  // Seleccionar fuente aleatoria
  const fuenteSeleccionada = obtenerFuenteAleatoria();
  const nombreFuente = fuenteSeleccionada.usarSistema ? fuenteSeleccionada.nombre : fuenteSeleccionada.nombre.replace(' Bold', '');
  console.log(`   🔤 Fuente seleccionada: ${fuenteSeleccionada.nombre}`);
  
  // Estilos disponibles de resaltado
  const estilosDisponibles = [
    { id: 'caja', nombre: 'Caja de color', emoji: '📦' },
    { id: 'relleno', nombre: 'Relleno de color', emoji: '🎨' }
  ];
  
  // Seleccionar estilo aleatorio
  const estiloSeleccionado = estilosDisponibles[Math.floor(Math.random() * estilosDisponibles.length)];
  console.log(`   ${estiloSeleccionado.emoji} Estilo de subtítulos: ${estiloSeleccionado.nombre}`);
  
  // Colores disponibles para resaltado (formato ASS: &HAABBGGRR&)
  // AA = Alpha (00 = opaco, FF = transparente), BBGGRR = Blue Green Red
  const coloresResaltado = [
    { nombre: 'Amarillo', codigo: '&H00FFFF00&', emoji: '🟡' },      // Amarillo opaco
    { nombre: 'Naranja', codigo: '&H0000A5FF&', emoji: '🟠' },       // Naranja opaco
    { nombre: 'Verde neón', codigo: '&H0000FF00&', emoji: '🟢' },    // Verde opaco
    { nombre: 'Azul cielo', codigo: '&H00FFAA00&', emoji: '🔵' },    // Azul opaco
    { nombre: 'Morado', codigo: '&H00FF00FF&', emoji: '🟣' },        // Morado opaco
    { nombre: 'Rojo', codigo: '&H000000FF&', emoji: '🔴' }           // Rojo opaco
  ];
  
  // Seleccionar un color aleatorio para este video
  const colorSeleccionado = coloresResaltado[Math.floor(Math.random() * coloresResaltado.length)];
  console.log(`   ${colorSeleccionado.emoji} Color de resaltado: ${colorSeleccionado.nombre}`);
  
  // Construir header según el estilo seleccionado
  let estiloResaltado;
  let tamanoResaltado;
  
  if (estiloSeleccionado.id === 'caja') {
    // ESTILO 1: Caja de color (estilo actual)
    // PrimaryColour y SecondaryColour = color (caja)
    // OutlineColour = negro (borde)
    // BorderStyle=4 (caja opaca con borde)
    estiloResaltado = `Style: Resaltado,${nombreFuente},18,${colorSeleccionado.codigo},${colorSeleccionado.codigo},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,4,3,0,2,40,40,80,1`;
    tamanoResaltado = 18;
  } else {
    // ESTILO 2: Relleno de color (nuevo)
    // PrimaryColour = color (relleno de texto)
    // OutlineColour = negro (borde)
    // BorderStyle=1 (borde normal)
    // Fontsize=24 (más grande que el 18 del texto blanco)
    estiloResaltado = `Style: Resaltado,${nombreFuente},24,${colorSeleccionado.codigo},${colorSeleccionado.codigo},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,80,1`;
    tamanoResaltado = 24;
  }
  
  // Configuración de estilo Karaoke/Reels
  const assHeader = `[Script Info]
Title=Karaoke estilo Reels
ScriptType=v4.00+
PlayResX=1080
PlayResY=1920
WrapStyle=0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding

; Texto blanco normal con borde negro
Style: Blanco,${nombreFuente},18,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,1,2,2,40,40,80,1

; Estilo de palabra resaltada (dinámico según selección aleatoria)
${estiloResaltado}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let dialogos = '';
  
  for (const sub of subtitulos) {
    const palabrasArray = sub.palabras;
    
    // Mostrar grupos de palabras (la actual resaltada, las demás en blanco)
    for (let i = 0; i < palabrasArray.length; i++) {
      const palabra = palabrasArray[i];
      const palabraTexto = palabra.word.toUpperCase();
      
      // Tiempos de esta palabra
      const inicioPalabra = formatearTiempoASS(palabra.start);
      const finPalabra = formatearTiempoASS(palabra.end);
      
      // Construir texto con palabras de contexto + palabra resaltada
      let textoCompleto = '';
      
      // Palabras anteriores (máximo 2) - estilo Blanco
      const inicio = Math.max(0, i - 2);
      for (let j = inicio; j < i; j++) {
        textoCompleto += palabrasArray[j].word.toUpperCase() + ' ';
      }
      
      // Palabra actual RESALTADA usando tags inline
      // Tags ASS para cambiar temporalmente el estilo:
      // \\r = reset a estilo base
      // \\rResaltado = cambiar a estilo "Resaltado"
      textoCompleto += `{\\rResaltado}${palabraTexto}{\\r}`;
      
      // Palabra siguiente (si existe) - volver a estilo Blanco
      if (i < palabrasArray.length - 1) {
        textoCompleto += ' ' + palabrasArray[i + 1].word.toUpperCase();
      }
      
      // Crear diálogo único con todo el texto (estilo base es Blanco)
      dialogos += `Dialogue: 0,${inicioPalabra},${finPalabra},Blanco,,0,0,0,,${textoCompleto}\n`;
    }
  }
  console.log("ASS: " + assHeader + dialogos);
  await fsPromises.writeFile(rutaASS, assHeader + dialogos, 'utf-8');
  console.log(`✅ Archivo ASS generado: ${rutaASS}`);
  console.log(`   Total de diálogos: ${dialogos.split('\n').length - 1}`);
  
  // Retornar información de la fuente para usar en FFmpeg
  return fuenteSeleccionada;
}

module.exports = {
  transcribirAudioConWhisper,
  agruparPalabrasEnSubtitulos,
  formatearTiempoASS,
  generarArchivoASS
};
