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
  
  // Colores disponibles para resaltado de fondo (formato ASS: &HAABBGGRR&)
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
  
  // Configuración de estilo Karaoke/Reels con fondo de color
  const assHeader = `[Script Info]
Title=Karaoke estilo Reels
ScriptType=v4.00+
PlayResX=1080
PlayResY=1920
WrapStyle=0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding

; Texto blanco normal con borde negro
Style: Blanco,Arial Black,18,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,1,2,2,40,40,80,1

; Estilo de palabra resaltada con fondo de color (BorderStyle=4 = caja opaca con borde)
Style: Resaltado,Arial Black,18,${colorSeleccionado.codigo},${colorSeleccionado.codigo},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,4,3,0,2,40,40,80,1

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
      
      // Construir grupo de palabras: hasta 2 anteriores + actual + hasta 1 siguiente
      let textoGrupo = '';
      
      // Palabras anteriores (máximo 2)
      const inicio = Math.max(0, i - 2);
      for (let j = inicio; j < i; j++) {
        textoGrupo += palabrasArray[j].word.toUpperCase() + ' ';
      }
      
      // Palabra actual con fondo de color usando tag {\3c}
      // Usamos \3c para cambiar el OutlineColour temporalmente
      textoGrupo += `{\\3c${colorSeleccionado.codigo.replace('&', '').replace('&', '')}}${palabraTexto}{\\3c&H000000&}`;
      
      // Palabra siguiente (si existe)
      if (i < palabrasArray.length - 1) {
        textoGrupo += ' ' + palabrasArray[i + 1].word.toUpperCase();
      }
      
      // Crear diálogo con el grupo completo
      dialogos += `Dialogue: 0,${inicioPalabra},${finPalabra},Blanco,,0,0,0,,${textoGrupo}\n`;
    }
  }
  console.log("ASS: " + assHeader + dialogos);
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
