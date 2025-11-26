const { GUIONES_API_URL } = require('../../config');

/**
 * Generar guión usando la API de guiones cortos
 * @param {string} canalId - UUID del canal
 * @param {string} idea - Texto de la idea
 * @param {number} duracionSegundos - Duración deseada (15-90 segundos)
 * @returns {Promise<Object>} - Guión generado
 */
async function generarGuionDesdeAPI(canalId, idea, duracionSegundos = 30) {
  console.log('🎬 Generando guión desde API...');
  console.log(`   Canal ID: ${canalId}`);
  console.log(`   Idea: ${idea.substring(0, 100)}...`);
  console.log(`   Duración: ${duracionSegundos}s`);
  
  try {
    // Validar parámetros requeridos
    if (!canalId || !idea) {
      throw new Error('Parámetros requeridos faltantes: canal_id y/o idea');
    }

    if (duracionSegundos < 15 || duracionSegundos > 90) {
      throw new Error('Duración debe estar entre 15 y 90 segundos');
    }

    // Preparar payload
    const payload = {
      canal_id: canalId,
      idea: idea,
      duracion_segundos: duracionSegundos
    };

    // Llamar a la API
    const response = await fetch(GUIONES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Manejar errores HTTP
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error desconocido' }));
      
      if (response.status === 400) {
        throw new Error(`Error de validación (400): ${errorData.error || errorData.message || 'Datos inválidos'}`);
      } else if (response.status === 500) {
        throw new Error(`Error del servidor (500): ${errorData.error || errorData.message || 'Error interno'}`);
      } else {
        throw new Error(`Error HTTP ${response.status}: ${errorData.error || errorData.message || 'Error desconocido'}`);
      }
    }

    // Parsear respuesta
    const data = await response.json();
    
    if (!data.guion || !data.guion.id) {
      throw new Error('Respuesta de API inválida: falta guion.id');
    }

    const guion = data.guion;
    
    console.log('✅ Guión generado exitosamente');
    console.log(`   ID: ${guion.id}`);
    console.log(`   Título YouTube: ${guion.titulo?.youtube_shorts || 'N/A'}`);
    console.log(`   Título Facebook: ${guion.titulo?.facebook || 'N/A'}`);
    console.log(`   Imágenes requeridas: ${guion.imagenes_requeridas || 'N/A'}`);
    console.log(`   Escenas en storyboard: ${guion.guion_detallado?.storyboard?.length || 0}`);
    
    return guion;
    
  } catch (error) {
    console.error('❌ Error al generar guión desde API:', error.message);
    throw error;
  }
}

module.exports = {
  generarGuionDesdeAPI
};
