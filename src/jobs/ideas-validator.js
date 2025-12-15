/**
 * Job: Validador y Generador de Ideas
 * 
 * Valida que cada canal tenga al menos 20 ideas sin utilizar.
 * Si no cumple el umbral, genera nuevas ideas automáticamente.
 */

const fetch = require('node-fetch');
const { supabase, CHANNEL_FILTER, UMBRAL_MINIMO_IDEAS, UMBRAL_MINIMO_GUIONES } = require('../config');
const { reportarError, TipoError, Severidad } = require('../services/heartbeat');

// Variable de control de concurrencia
let isValidatingIdeas = false;

/**
 * Obtener información de un canal
 */
async function obtenerCanal(canalId) {
  const { data, error } = await supabase
    .from('canales')
    .select('*')
    .eq('id', canalId)
    .single();

  if (error) {
    throw new Error(`Error al obtener canal: ${error.message}`);
  }

  return data;
}

/**
 * Contar ideas sin utilizar para un canal
 */
async function contarIdeasDisponibles(canalId) {
  const { count, error } = await supabase
    .from('ideas')
    .select('id', { count: 'exact', head: true })
    .eq('canal_id', canalId)
    .eq('utilizada', false);

  if (error) {
    throw new Error(`Error al contar ideas: ${error.message}`);
  }

  return count || 0;
}

/**
 * Contar guiones en estado 'generado' sin video generado para un canal
 */
async function contarGuionesGenerados(canalId) {
  // 1. Obtener todos los guiones en estado 'generado' del canal
  const { data: guiones, error: errorGuiones } = await supabase
    .from('guiones')
    .select('id')
    .eq('canal_id', canalId)
    .eq('estado', 'generado');

  if (errorGuiones) {
    throw new Error(`Error al obtener guiones: ${errorGuiones.message}`);
  }

  if (!guiones || guiones.length === 0) {
    return 0;
  }

  // 2. Obtener IDs de guiones que ya tienen video
  const guionesIds = guiones.map(g => g.id);
  
  const { data: videos, error: errorVideos } = await supabase
    .from('videos')
    .select('guion_id')
    .in('guion_id', guionesIds);

  if (errorVideos) {
    throw new Error(`Error al obtener videos: ${errorVideos.message}`);
  }

  // 3. Contar guiones que NO tienen video
  const guionesConVideo = new Set(videos?.map(v => v.guion_id) || []);
  const guionesSinVideo = guiones.filter(g => !guionesConVideo.has(g.id));

  return guionesSinVideo.length;
}

/**
 * Marcar ideas más antiguas como utilizadas para un canal
 * @param {string} canalId - ID del canal
 * @param {number} cantidad - Cantidad de ideas a marcar
 * @returns {number} Cantidad de ideas marcadas
 */
async function marcarIdeasComoUtilizadas(canalId, cantidad) {
  // 1. Obtener las ideas más antiguas sin utilizar
  const { data: ideas, error: errorSelect } = await supabase
    .from('ideas')
    .select('id')
    .eq('canal_id', canalId)
    .eq('utilizada', false)
    .order('created_at', { ascending: true })
    .limit(cantidad);

  if (errorSelect) {
    throw new Error(`Error al obtener ideas: ${errorSelect.message}`);
  }

  if (!ideas || ideas.length === 0) {
    return 0;
  }

  // 2. Marcar como utilizadas
  const idsAMarcar = ideas.map(idea => idea.id);
  
  const { error: errorUpdate } = await supabase
    .from('ideas')
    .update({ 
      utilizada: true,
      utilizada_at: new Date().toISOString()
    })
    .in('id', idsAMarcar);

  if (errorUpdate) {
    throw new Error(`Error al marcar ideas: ${errorUpdate.message}`);
  }

  return ideas.length;
}

/**
 * Generar ideas automáticamente para un canal
 */
async function generarIdeasParaCanal(canal) {
  const apiBaseUrl = process.env.API_BASE_URL;

  if (!apiBaseUrl) {
    console.error('⚠️  API_BASE_URL no configurado, no se pueden generar ideas');
    return null;
  }

  console.log(`\n📝 Generando ideas para canal: ${canal.nombre}`);
  console.log(`   Notas/Intereses: ${canal.notas || 'No definidos'}`);

  if (!canal.notas) {
    console.error('❌ Canal sin intereses definidos en campo "notas"');
    await reportarError({
      tipo: TipoError.PROCESSING,
      severidad: Severidad.WARNING,
      mensaje: 'Canal sin intereses definidos para generar ideas',
      canalId: canal.id,
      contexto: {
        canal_nombre: canal.nombre
      }
    });
    return null;
  }

  try {
    // 1. Generar ideas con la API
    console.log('   🤖 Solicitando ideas a ChatGPT...');
    const urlGenerar = `${apiBaseUrl}/ideas/generar`;
    
    const resGenerar = await fetch(urlGenerar, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intereses: canal.notas
      })
    });

    if (!resGenerar.ok) {
      const errorText = await resGenerar.text();
      throw new Error(`HTTP ${resGenerar.status}: ${errorText}`);
    }

    const dataGenerar = await resGenerar.json();
    
    if (!dataGenerar.success) {
      throw new Error(dataGenerar.error || 'Error desconocido al generar ideas');
    }

    const totalGeneradas = dataGenerar.ideas?.length || 0;
    console.log(`   ✅ ChatGPT generó ${totalGeneradas} ideas`);

    if (totalGeneradas === 0) {
      console.log('   ⚠️  No se generaron ideas');
      return {
        generadas: 0,
        filtradas: 0,
        guardadas: 0,
        descartadas: 0
      };
    }

    // 2. Filtrar ideas - eliminar las de potencial bajo
    const ideasFiltradas = dataGenerar.ideas.filter(
      idea => idea.potencial_viral !== 'bajo'
    );

    const totalDescartadas = totalGeneradas - ideasFiltradas.length;
    console.log(`   🔍 Filtradas: ${ideasFiltradas.length} ideas (${totalDescartadas} descartadas por bajo potencial)`);

    if (ideasFiltradas.length === 0) {
      console.log('   ⚠️  Todas las ideas fueron descartadas por bajo potencial');
      return {
        generadas: totalGeneradas,
        filtradas: 0,
        guardadas: 0,
        descartadas: totalDescartadas
      };
    }

    // 3. Guardar en base de datos
    console.log('   💾 Guardando ideas en la base de datos...');
    const urlGuardar = `${apiBaseUrl}/ideas`;
    
    const resGuardar = await fetch(urlGuardar, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canal_id: canal.id,
        ideas: ideasFiltradas
      })
    });

    if (!resGuardar.ok) {
      const errorText = await resGuardar.text();
      throw new Error(`HTTP ${resGuardar.status}: ${errorText}`);
    }

    const dataGuardar = await resGuardar.json();
    
    if (!dataGuardar.success) {
      throw new Error(dataGuardar.error || 'Error desconocido al guardar ideas');
    }

    const totalGuardadas = dataGuardar.total || 0;
    console.log(`   ✅ Guardadas ${totalGuardadas} ideas en la base de datos`);

    return {
      generadas: totalGeneradas,
      filtradas: ideasFiltradas.length,
      guardadas: totalGuardadas,
      descartadas: totalDescartadas
    };

  } catch (error) {
    console.error(`   ❌ Error generando ideas: ${error.message}`);
    
    await reportarError({
      tipo: TipoError.API,
      severidad: Severidad.ERROR,
      mensaje: `Error al generar ideas para canal ${canal.nombre}`,
      error: error,
      canalId: canal.id,
      contexto: {
        canal_nombre: canal.nombre,
        tiene_notas: !!canal.notas
      }
    });

    return null;
  }
}

/**
 * Proceso principal: Validar ideas y generar si es necesario
 */
async function validarYGenerarIdeas() {
  // Verificar si ya hay una ejecución en progreso
  if (isValidatingIdeas) {
    console.log('\n⏸️  Validación de ideas ya en progreso, omitiendo esta ejecución...\n');
    return;
  }

  // Marcar como en progreso
  isValidatingIdeas = true;

  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 VALIDACIÓN Y GENERACIÓN DE IDEAS');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('='.repeat(80) + '\n');

    // 1. Obtener canales activos
    let query = supabase
      .from('canales')
      .select('id, nombre, notas, generacion_automatica')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    // Aplicar filtros de canales si está habilitado
    if (CHANNEL_FILTER.enabled && CHANNEL_FILTER.channels.ids.length > 0) {
      query = query.in('id', CHANNEL_FILTER.channels.ids);
    }

    const { data: canales, error } = await query;

    if (error) {
      throw new Error(`Error al consultar canales: ${error.message}`);
    }

    if (!canales || canales.length === 0) {
      console.log('⚠️  No hay canales activos para validar\n');
      return;
    }

    // Filtrar por nombres si es necesario
    let canalesFiltrados = canales;
    if (CHANNEL_FILTER.enabled && CHANNEL_FILTER.channels.names.length > 0) {
      canalesFiltrados = canales.filter(canal => 
        CHANNEL_FILTER.channels.names.includes(canal.nombre)
      );
    }

    // Filtrar solo canales con generación automática habilitada
    canalesFiltrados = canalesFiltrados.filter(canal => canal.generacion_automatica === true);

    if (canalesFiltrados.length === 0) {
      console.log('⚠️  No hay canales con generación automática habilitada\n');
      return;
    }

    console.log(`📋 Canales a validar (generación automática): ${canalesFiltrados.length}`);
    canalesFiltrados.forEach(c => console.log(`   • ${c.nombre} (${c.id})`));
    console.log('');

    // 2. Validar cada canal
    let canalesValidados = 0;
    let canalesConIdeasSuficientes = 0;
    let canalesQueNecesitanIdeas = 0;
    let canalesConIdeasGeneradas = 0;
    let canalesConErrores = 0;
    let totalIdeasGeneradas = 0;
    let canalesConGuionesSuficientes = 0;
    let canalesQueNecesitanGuiones = 0;
    let totalIdeasMarcadas = 0;

    for (const canal of canalesFiltrados) {
      console.log('─'.repeat(80));
      console.log(`📺 Canal: ${canal.nombre}`);
      
      try {
        // ========================================
        // PASO 1: Validar guiones generados
        // ========================================
        const guionesGenerados = await contarGuionesGenerados(canal.id);
        console.log(`   📝 Guiones generados: ${guionesGenerados}`);
        console.log(`   🎯 Umbral mínimo de guiones: ${UMBRAL_MINIMO_GUIONES}`);

        if (guionesGenerados < UMBRAL_MINIMO_GUIONES) {
          const guionesFaltantes = UMBRAL_MINIMO_GUIONES - guionesGenerados;
          console.log(`   ⚠️  Canal necesita más guiones (${guionesFaltantes} faltantes)`);
          canalesQueNecesitanGuiones++;

          // Marcar ideas como utilizadas (las más antiguas)
          const ideasMarcadas = await marcarIdeasComoUtilizadas(canal.id, guionesFaltantes);
          
          if (ideasMarcadas > 0) {
            console.log(`   ✅ Marcadas ${ideasMarcadas} ideas como utilizadas (más antiguas primero)`);
            totalIdeasMarcadas += ideasMarcadas;
          } else {
            console.log(`   ⚠️  No hay ideas disponibles para marcar como utilizadas`);
          }
        } else {
          console.log(`   ✅ Canal tiene suficientes guiones generados`);
          canalesConGuionesSuficientes++;
        }

        // ========================================
        // PASO 2: Validar stock de ideas
        // ========================================
        const ideasDisponibles = await contarIdeasDisponibles(canal.id);
        console.log(`   📊 Ideas disponibles (utilizada=false): ${ideasDisponibles}`);
        console.log(`   🎯 Umbral mínimo de ideas: ${UMBRAL_MINIMO_IDEAS}`);

        canalesValidados++;

        if (ideasDisponibles >= UMBRAL_MINIMO_IDEAS) {
          console.log(`   ✅ Canal tiene suficientes ideas\n`);
          canalesConIdeasSuficientes++;
          continue;
        }

        // Canal necesita más ideas
        console.log(`   ⚠️  Canal necesita más ideas (${UMBRAL_MINIMO_IDEAS - ideasDisponibles} faltantes)`);
        canalesQueNecesitanIdeas++;

        // Verificar si tiene generación automática habilitada
        if (!canal.generacion_automatica) {
          console.log(`   ⏸️  Generación automática deshabilitada, omitiendo...\n`);
          continue;
        }

        // Generar ideas
        const resultado = await generarIdeasParaCanal(canal);

        if (resultado && resultado.guardadas > 0) {
          canalesConIdeasGeneradas++;
          totalIdeasGeneradas += resultado.guardadas;
          
          console.log(`   📈 Resumen de generación:`);
          console.log(`      • Generadas por ChatGPT: ${resultado.generadas}`);
          console.log(`      • Filtradas (medio/alto): ${resultado.filtradas}`);
          console.log(`      • Guardadas en BD: ${resultado.guardadas}`);
          console.log(`      • Descartadas (bajo potencial): ${resultado.descartadas}`);
        } else {
          console.log(`   ❌ No se pudieron generar ideas para este canal`);
          canalesConErrores++;
        }

        console.log('');

      } catch (error) {
        console.error(`   ❌ Error procesando canal: ${error.message}\n`);
        canalesConErrores++;
      }
    }

    // 3. Resumen final
    console.log('='.repeat(80));
    console.log('✅ VALIDACIÓN COMPLETADA');
    console.log('');
    console.log('📝 Guiones:');
    console.log(`   Con guiones suficientes: ${canalesConGuionesSuficientes}`);
    console.log(`   Que necesitaban guiones: ${canalesQueNecesitanGuiones}`);
    console.log(`   Total ideas marcadas (utilizada=true): ${totalIdeasMarcadas}`);
    console.log('');
    console.log('💡 Ideas:');
    console.log(`   Total canales validados: ${canalesValidados}`);
    console.log(`   Con ideas suficientes: ${canalesConIdeasSuficientes}`);
    console.log(`   Que necesitaban ideas: ${canalesQueNecesitanIdeas}`);
    console.log(`   Con ideas generadas: ${canalesConIdeasGeneradas}`);
    console.log(`   Total ideas generadas: ${totalIdeasGeneradas}`);
    console.log('');
    console.log(`❌ Con errores: ${canalesConErrores}`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR EN VALIDACIÓN DE IDEAS:', error.message);
    console.error('Stack trace:', error.stack);
    
    await reportarError({
      tipo: TipoError.PROCESSING,
      severidad: Severidad.ERROR,
      mensaje: 'Error en proceso de validación de ideas',
      error: error
    });
  } finally {
    // Liberar lock siempre, incluso si hay error
    isValidatingIdeas = false;
  }
}

module.exports = {
  validarYGenerarIdeas
};
