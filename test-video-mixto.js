/**
 * Script de prueba para generación de video con mezcla de imágenes y videos
 * 
 * Este script demuestra cómo usar la función generarVideo() con:
 * - Mezcla de imágenes y videos
 * - Duración híbrida (videos cortos completos, largos recortados)
 * - Ken Burns aplicado a ambos tipos de media
 */

const { generarVideo } = require('./src/services/video/generator');
const path = require('path');

async function testGeneracionMixta() {
  console.log('=== TEST DE GENERACIÓN CON VIDEOS E IMÁGENES ===\n');
  
  // Configuración de prueba
  const mediasTest = [
    // Aquí deberías poner rutas reales de archivos para probar
    // path.join(__dirname, 'test-assets', 'video1.mp4'),
    // path.join(__dirname, 'test-assets', 'imagen1.jpg'),
    // path.join(__dirname, 'test-assets', 'video2.mov'),
    // path.join(__dirname, 'test-assets', 'imagen2.png'),
  ];
  
  const audioTest = path.join(__dirname, 'test-assets', 'audio.mp3');
  const salidaTest = path.join(__dirname, 'test-output', 'video-mixto.mp4');
  const duracionBase = 5.0; // segundos por segmento
  
  console.log('Configuración:');
  console.log(`- Medias: ${mediasTest.length} archivos`);
  console.log(`- Audio: ${audioTest}`);
  console.log(`- Duración base: ${duracionBase}s por segmento`);
  console.log(`- Salida: ${salidaTest}\n`);
  
  console.log('⚠️  NOTA: Este script requiere archivos de prueba en test-assets/');
  console.log('Para usar, descomenta las rutas arriba y agrega tus archivos de prueba.\n');
  
  // Descomentar para ejecutar con archivos reales:
  /*
  try {
    await generarVideo(
      mediasTest,
      audioTest,
      duracionBase,
      salidaTest
    );
    
    console.log('\n✅ Video generado exitosamente!');
    console.log(`📹 Ubicación: ${salidaTest}`);
  } catch (error) {
    console.error('\n❌ Error generando video:', error);
  }
  */
  
  console.log('📋 ESCENARIOS DE PRUEBA SUGERIDOS:\n');
  
  console.log('1. Solo imágenes (comportamiento original):');
  console.log('   [imagen1.jpg, imagen2.jpg, imagen3.jpg]');
  console.log('   Resultado: Cada imagen 5s con Ken Burns\n');
  
  console.log('2. Solo videos (nuevo):');
  console.log('   [video1.mp4(3s), video2.mp4(8s), video3.mp4(4s)]');
  console.log('   Con duracionBase=5:');
  console.log('   - video1.mp4 → 3s (completo)');
  console.log('   - video2.mp4 → 5s (recortado de 8s)');
  console.log('   - video3.mp4 → 4s (completo)');
  console.log('   Total: 12s con Ken Burns en todos\n');
  
  console.log('3. Mezcla de imágenes y videos (híbrido):');
  console.log('   [intro.mp4(4s), foto1.jpg, clip.mp4(7s), foto2.jpg]');
  console.log('   Con duracionBase=5:');
  console.log('   - intro.mp4 → 4s completo + Ken Burns');
  console.log('   - foto1.jpg → 5s estático + Ken Burns');
  console.log('   - clip.mp4 → 5s recortado + Ken Burns');
  console.log('   - foto2.jpg → 5s estático + Ken Burns');
  console.log('   Total: 19s\n');
  
  console.log('4. Con subtítulos ASS:');
  console.log('   Agregar quinto parámetro con ruta al archivo .ass');
  console.log('   Los subtítulos se sincronizan con las duraciones reales\n');
  
  console.log('💡 VENTAJAS:');
  console.log('✓ Ken Burns funciona en videos e imágenes');
  console.log('✓ Duración híbrida inteligente para videos');
  console.log('✓ Compatible con código existente (solo imágenes)');
  console.log('✓ Color grading y subtítulos funcionan igual');
  console.log('✓ Detección automática de tipo de media por extensión\n');
}

// Ejecutar test
testGeneracionMixta().catch(console.error);
