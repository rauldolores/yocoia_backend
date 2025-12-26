/**
 * Queries para tabla musica_fondo
 */

const { supabase } = require('../config');

/**
 * Obtener música de fondo aleatoria según tipo de contenido y plataforma
 * @param {string} tipoContenido - 'video_corto' o 'video_largo'
 * @param {string} plataforma - 'youtube' o 'facebook'
 * @returns {Promise<Object|null>} - Música seleccionada o null si no hay disponible
 */
async function obtenerMusicaAleatoria(tipoContenido, plataforma) {
  try {
    console.log(`   🎵 Buscando música para ${tipoContenido} en ${plataforma}...`);
    
    // Construir filtro para plataforma usando JSONB
    const filtroPlataforma = `plataformas->>${plataforma}`;
    
    const { data, error } = await supabase
      .from('musica_fondo')
      .select('*')
      .eq('tipo_contenido', tipoContenido)
      .eq('activo', true)
      .eq(filtroPlataforma, 'true');
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      console.log(`   ⚠️  No hay música disponible para ${tipoContenido} en ${plataforma}`);
      return null;
    }
    
    // Seleccionar una música al azar
    const musicaSeleccionada = data[Math.floor(Math.random() * data.length)];
    
    console.log(`   ✅ Música seleccionada: "${musicaSeleccionada.nombre}" (${data.length} disponibles)`);
    
    return musicaSeleccionada;
  } catch (error) {
    console.error(`   ❌ Error al obtener música: ${error.message}`);
    return null;
  }
}

module.exports = {
  obtenerMusicaAleatoria
};
