const { supabase, TIMEZONE, CHANNEL_FILTER } = require('../../config');
const { obtenerFechaMexico, obtenerTimestampMexico } = require('../../utils/date');
const { generarGuionDesdeAPI } = require('./api-client');

// Lock para evitar ejecuciones concurrentes
let isGeneratingGuiones = false;

/**
 * Actualizar idea con el guión generado
 * @param {string} ideaId - ID de la idea
 * @param {string} guionId - ID del guión generado
 */
async function actualizarIdeaConGuion(ideaId, guionId) {
  try {
    const { error } = await supabase
      .from('ideas')
      .update({
        guion_id: guionId,
        utilizada_at: obtenerTimestampMexico()
      })
      .eq('id', ideaId);

    if (error) throw error;
    
    console.log(`✅ Idea ${ideaId} actualizada con guión ${guionId}`);
  } catch (error) {
    console.error('❌ Error al actualizar idea:', error.message);
    throw error;
  }
}

/**
 * Proceso principal de generación de guiones desde ideas
 */
async function generarGuionesDesdeIdeas() {
  // Verificar si ya hay una ejecución en progreso
  if (isGeneratingGuiones) {
    console.log('\n⏸️  Generación de guiones ya en progreso, omitiendo esta ejecución...\n');
    return;
  }

  // Marcar como en progreso
  isGeneratingGuiones = true;

  try {
    console.log('\n' + '='.repeat(80));
    console.log('💡 INICIANDO GENERACIÓN DE GUIONES DESDE IDEAS');
    console.log('⏰ Timestamp México:', obtenerFechaMexico().toLocaleString('es-MX', { timeZone: TIMEZONE }));
    console.log('='.repeat(80) + '\n');

    let generados = 0;
    let errores = 0;
    const MAX_IDEAS_POR_EJECUCION = 10;

  try {
    // Procesar ideas una por una para evitar que la lista en memoria quede desactualizada
    for (let i = 0; i < MAX_IDEAS_POR_EJECUCION; i++) {
      // Consultar la próxima idea pendiente en cada iteración
      let query = supabase
        .from('ideas')
        .select(`
          id,
          canal_id,
          texto,
          plataformas,
          potencial_viral,
          metadata,
          canales!inner (
            id,
            nombre
          )
        `)
        .eq('utilizada', true)
        .is('guion_id', null)
        .order('created_at', { ascending: true })
        .limit(1);

      // Aplicar filtros de canales si está habilitado
      if (CHANNEL_FILTER.enabled && CHANNEL_FILTER.channels.ids.length > 0) {
        query = query.in('canal_id', CHANNEL_FILTER.channels.ids);
      }

      const { data: ideas, error } = await query;

      if (error) {
        console.error('❌ Error al consultar ideas:', error.message);
        break;
      }

      // Si hay filtro por nombres de canal, aplicarlo en memoria
      let ideasFiltradas = ideas || [];
      if (CHANNEL_FILTER.enabled && CHANNEL_FILTER.channels.names.length > 0 && ideasFiltradas.length > 0) {
        ideasFiltradas = ideasFiltradas.filter(idea => {
          const nombreCanal = idea.canales?.nombre;
          return nombreCanal && CHANNEL_FILTER.channels.names.includes(nombreCanal);
        });
      }

      // Si no hay más ideas pendientes, terminar
      if (!ideasFiltradas || ideasFiltradas.length === 0) {
        if (i === 0) {
          console.log('⚠️  No hay ideas pendientes para generar guiones');
        }
        break;
      }

      const idea = ideasFiltradas[0];
      
      console.log('─'.repeat(80));
      console.log(`💡 Procesando idea ${i + 1}`);
      console.log(`   ID: ${idea.id}`);
      console.log(`   Canal: ${idea.canales?.nombre || 'N/A'}`);
      console.log(`   Potencial: ${idea.potencial_viral || 'N/A'}`);
      console.log(`   Texto: ${idea.texto.substring(0, 100)}...`);

      try {
        // Determinar duración según metadata o usar default
        const duracionSegundos = idea.metadata?.duracion_segundos || 30;
        
        // Generar guión
        const guion = await generarGuionDesdeAPI(idea.canal_id, idea.texto, duracionSegundos);
        
        if (guion && guion.id) {
          // Actualizar idea con el guión generado
          await actualizarIdeaConGuion(idea.id, guion.id);
          generados++;
          console.log(`✅ Guión generado y vinculado correctamente\n`);
        } else {
          console.error('❌ La API no retornó un guión válido\n');
          errores++;
        }
        
      } catch (error) {
        console.error(`❌ Error procesando idea ${idea.id}:`, error.message);
        errores++;
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log('✅ GENERACIÓN DE GUIONES COMPLETADA');
    console.log(`   Generados: ${generados}`);
    console.log(`   Errores: ${errores}`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR EN GENERACIÓN DE GUIONES:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Liberar lock siempre, incluso si hay error
    isGeneratingGuiones = false;
  }
}

module.exports = {
  generarGuionesDesdeIdeas,
  actualizarIdeaConGuion
};
