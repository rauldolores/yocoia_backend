const { supabase, TIMEZONE, CHANNEL_FILTER } = require('../../config');
const { obtenerFechaMexico, obtenerTimestampMexico } = require('../../utils/date');
const { generarGuionDesdeAPI } = require('./api-client');

// Constantes configurables
const MAX_IDEAS_POR_EJECUCION = 10;
const UMBRAL_MINIMO_GUIONES = parseInt(process.env.UMBRAL_MINIMO_GUIONES || '5', 10);

// Lock para evitar ejecuciones concurrentes
let isGeneratingGuiones = false;

/**
 * Contar guiones generados (sin video) de un canal
 * @param {string} canalId - ID del canal
 * @returns {Promise<number>}
 */
async function contarGuionesGenerados(canalId) {
  try {
    const { count, error } = await supabase
      .from('guiones')
      .select('id', { count: 'exact', head: true })
      .eq('canal_id', canalId)
      .eq('estado', 'generado')
      .eq('tipo_guion', 'corto');

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('❌ Error al contar guiones generados:', error.message);
    return 0;
  }
}

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

    // 🔍 DEBUG: Mostrar configuración de filtros
    console.log('🔍 DEBUG - Configuración de filtros:');
    console.log(`   • Filtro habilitado: ${CHANNEL_FILTER.enabled}`);
    console.log(`   • IDs en filtro: ${CHANNEL_FILTER.channels.ids.length > 0 ? CHANNEL_FILTER.channels.ids.join(', ') : 'Ninguno'}`);
    console.log(`   • Nombres en filtro: ${CHANNEL_FILTER.channels.names.length > 0 ? CHANNEL_FILTER.channels.names.join(', ') : 'Ninguno'}`);
    console.log('');

    let generados = 0;
    let errores = 0;
    let omitidosPorStock = 0;

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

      // 🔍 DEBUG: Mostrar ideas encontradas antes del filtro
      if (i === 0) {
        console.log(`🔍 DEBUG - Ideas encontradas en query: ${ideas?.length || 0}`);
        if (ideas && ideas.length > 0) {
          ideas.forEach((idea, idx) => {
            console.log(`   ${idx + 1}. Canal: "${idea.canales?.nombre}" (${idea.canal_id})`);
            console.log(`      Idea: ${idea.texto.substring(0, 60)}...`);
          });
        }
        console.log('');
      }

      // Si hay filtro por nombres de canal, aplicarlo en memoria
      let ideasFiltradas = ideas || [];
      if (CHANNEL_FILTER.enabled && CHANNEL_FILTER.channels.names.length > 0 && ideasFiltradas.length > 0) {
        // 🔍 DEBUG: Antes del filtrado
        const antesDelFiltro = ideasFiltradas.length;
        
        ideasFiltradas = ideasFiltradas.filter(idea => {
          const nombreCanal = idea.canales?.nombre;
          const incluido = nombreCanal && CHANNEL_FILTER.channels.names.includes(nombreCanal);
          
          // 🔍 DEBUG: Mostrar cada comparación
          if (i === 0) {
            console.log(`🔍 DEBUG - Filtro por nombre:`);
            console.log(`   Canal: "${nombreCanal}"`);
            console.log(`   ¿Está en filtro?: ${incluido ? '✅ SÍ' : '❌ NO'}`);
            if (!incluido) {
              console.log(`   (Buscando en: [${CHANNEL_FILTER.channels.names.join(', ')}])`);
            }
            console.log('');
          }
          
          return incluido;
        });
        
        // 🔍 DEBUG: Después del filtrado
        if (i === 0) {
          console.log(`🔍 DEBUG - Resultado del filtrado:`);
          console.log(`   Antes: ${antesDelFiltro} ideas`);
          console.log(`   Después: ${ideasFiltradas.length} ideas`);
          console.log(`   Descartadas: ${antesDelFiltro - ideasFiltradas.length}`);
          console.log('');
        }
      }

      // Si no hay más ideas pendientes, terminar
      if (!ideasFiltradas || ideasFiltradas.length === 0) {
        if (i === 0) {
          console.log('⚠️  No hay ideas pendientes para generar guiones');
          console.log('   Posibles causas:');
          console.log('   1. No hay ideas con utilizada=true y guion_id=null');
          console.log('   2. Las ideas encontradas fueron filtradas por canal');
          console.log('   3. Verifica el filtro FILTER_CHANNEL_NAMES en .env');
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
        // Verificar stock de guiones del canal
        console.log('   🔍 Verificando stock de guiones...');
        const guionesGenerados = await contarGuionesGenerados(idea.canal_id);
        console.log(`   📊 Stock actual: ${guionesGenerados} guiones generados`);
        
        if (guionesGenerados >= UMBRAL_MINIMO_GUIONES) {
          console.log(`   ✅ Canal ya tiene suficientes guiones (${guionesGenerados}/${UMBRAL_MINIMO_GUIONES}), omitiendo...`);
          omitidosPorStock++;
          continue; // Pasar a la siguiente idea
        }
        
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
    console.log(`   Ideas procesadas: ${generados + errores + omitidosPorStock}`);
    console.log(`   Generados: ${generados}`);
    console.log(`   Errores: ${errores}`);
    console.log(`   Omitidos por stock suficiente: ${omitidosPorStock}`);
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
