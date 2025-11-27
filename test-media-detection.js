// Test de las funciones de detección de tipo de media
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

// Tests
console.log('=== TESTS DE DETECCIÓN DE TIPO DE MEDIA ===\n');

const testFiles = [
  'video.mp4',
  'video.MOV',
  'clip.avi',
  'footage.mkv',
  'imagen.jpg',
  'foto.JPEG',
  'grafico.png',
  'icon.webp',
  'animation.gif',
  'documento.pdf',
  'audio.mp3'
];

testFiles.forEach(file => {
  const isVideo = esVideo(file);
  const isImage = esImagen(file);
  const type = isVideo ? '🎥 VIDEO' : (isImage ? '🖼️  IMAGEN' : '❓ DESCONOCIDO');
  console.log(`${type}: ${file}`);
});

console.log('\n✅ Tests completados');
