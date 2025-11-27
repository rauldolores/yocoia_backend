const { openai } = require('../../config');
const fs = require('fs');
const fsPromises = require('fs').promises;

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
  
  // Colores disponibles para resaltado (formato ASS: BGR en hexadecimal)
  const coloresResaltado = [
    { nombre: 'Amarillo', codigo: '&H00FFFF&', emoji: '🟡' },
    { nombre: 'Naranja', codigo: '&H0080FF&', emoji: '🟠' },
    { nombre: 'Verde neón', codigo: '&H00FF00&', emoji: '🟢' },
    { nombre: 'Azul cielo', codigo: '&HFFFF00&', emoji: '🔵' },
    { nombre: 'Morado', codigo: '&HFF00FF&', emoji: '🟣' },
    { nombre: 'Rojo', codigo: '&H0000FF&', emoji: '🔴' }
  ];
  
  // Seleccionar un color aleatorio para este video
  const colorSeleccionado = coloresResaltado[Math.floor(Math.random() * coloresResaltado.length)];
  console.log(`   ${colorSeleccionado.emoji} Color de resaltado: ${colorSeleccionado.nombre}`);
  
  // Configuración de estilo TikTok/Reels
  const assHeader = `[Script Info]
Title: Subtítulos Estilo TikTok
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,85,&H00FFFFFF,&H000000FF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,330,1
Style: Highlight,Arial Black,95,&H0000FFFF,&H000000FF,&H00000000,&HA0000000,-1,0,0,0,115,115,0,0,1,5,3,2,40,40,330,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let dialogos = '';
  
  for (const sub of subtitulos) {
    const palabrasArray = sub.palabras;
    
    // Crear UN SOLO evento para toda la frase que dura desde el inicio hasta el fin
    const inicioFrase = formatearTiempoASS(sub.inicio);
    const finFrase = formatearTiempoASS(sub.fin);
    
    // Construir el texto con transiciones de color por palabra usando \t (transform)
    let textoAnimado = '';
    let tiempoAcumulado = 0; // Milisegundos desde el inicio de la frase
    
    for (let i = 0; i < palabrasArray.length; i++) {
      const palabra = palabrasArray[i];
      const palabraTexto = palabra.word.toUpperCase();
      
      // Calcular tiempos relativos al inicio de la frase (en milisegundos)
      const inicioPalabraRelativo = Math.round((palabra.start - sub.inicio) * 1000);
      const finPalabraRelativo = Math.round((palabra.end - sub.inicio) * 1000);
      const duracionPalabra = finPalabraRelativo - inicioPalabraRelativo;
      
      // Palabra con transición suave de color
      // Antes de activarse: blanco
      // Durante: color seleccionado con escala
      // Después: vuelve a blanco
      textoAnimado += `{\\t(${inicioPalabraRelativo},${inicioPalabraRelativo + 50},\\c${colorSeleccionado.codigo}\\fscx120\\fscy120)}`;
      textoAnimado += `{\\t(${finPalabraRelativo - 50},${finPalabraRelativo},\\c&HFFFFFF&\\fscx100\\fscy100)}`;
      textoAnimado += palabraTexto;
      
      // Agregar espacio entre palabras (excepto la última)
      if (i < palabrasArray.length - 1) {
        textoAnimado += ' ';
      }
    }
    
    // Un solo diálogo para toda la frase con fade in/out
    dialogos += `Dialogue: 0,${inicioFrase},${finFrase},Default,,0,0,0,,{\\fad(150,150)}${textoAnimado}\n`;
  }
  
  await fsPromises.writeFile(rutaASS, assHeader + dialogos, 'utf-8');
  console.log(`✅ Archivo ASS generado: ${rutaASS}`);
  console.log(`   Total de diálogos: ${dialogos.split('\n').length - 1}`);
}

module.exports = {
  transcribirAudioConWhisper,
  agruparPalabrasEnSubtitulos,
  formatearTiempoASS,
  generarArchivoASS
};
