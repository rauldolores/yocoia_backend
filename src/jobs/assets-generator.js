/**
 * Job: Generador de Assets (Audio e Imágenes)
 * 
 * Genera los audios e imágenes necesarios para guiones en estado 'generado'
 * que aún no tienen video asociado.
 */

const fetch = require('node-fetch');
const { supabase, CHANNEL_FILTER, UMBRAL_VIDEOS_LISTOS } = require('../config');
const { reportarError, TipoError, Severidad } = require('../services/heartbeat');

// Variable de control de concurrencia
let isGeneratingAssets = false;

// Configuración
const DURACION_POR_IMAGEN = 5; // segundos

/**
 * Contar videos pendientes de publicar por canal
 * El stock se mide por videos en estado 'pendiente_publicar', no por guiones
 */
async function contarVideosListos(canalId) {
  console.log(`   🔍 Consultando videos pendientes para canal: ${canalId}`);
  
  // 1. Obtener todos los guiones del canal
  const { data: guiones, error: errorGuiones } = await supabase
    .from('guiones')
    .select('id')
    .eq('canal_id', canalId)
    .eq('tipo_guion', 'corto');

  if (errorGuiones) {
    console.error(`   ❌ Error al obtener guiones del canal: ${errorGuiones.message}`);
    throw new Error(`Error al obtener guiones del canal: ${errorGuiones.message}`);
  }

  const guionesIds = guiones?.map(g => g.id) || [];
  console.log(`   📋 Guiones del canal: ${guionesIds.length}`);
  
  if (guionesIds.length === 0) {
    console.log(`   ℹ️  Canal sin guiones, stock = 0`);
    return 0;
  }

  // 2. Contar videos en estado 'pendiente_publicar' de esos guiones
  const { count, error: errorVideos } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente_publicar')
    .in('guion_id', guionesIds);

  if (errorVideos) {
    console.error(`   ❌ Error al contar videos: ${errorVideos.message}`);
    throw new Error(`Error al contar videos pendientes: ${errorVideos.message}`);
  }

  console.log(`   ✅ Videos pendientes encontrados: ${count || 0}`);
  return count || 0;
}

/**
 * Obtener guiones que necesitan assets
 * (estado='generado' y sin video asociado)
 */
async function obtenerGuionesParaAssets() {
  // 1. Obtener guiones en estado 'generado'
  let query = supabase
    .from('guiones')
    .select(`
      id,
      canal_id,
      nombre,
      guion_detallado_json,
      canales!inner (
        id,
        nombre,
        generacion_automatica
      )
    `)
    .eq('estado', 'generado')
    .eq('tipo_guion', 'corto')
    .order('created_at', { ascending: true });

  // Aplicar filtros de canales si está habilitado
  if (CHANNEL_FILTER.enabled && CHANNEL_FILTER.channels.ids.length > 0) {
    query = query.in('canal_id', CHANNEL_FILTER.channels.ids);
  }

  const { data: guiones, error: errorGuiones } = await query;

  if (errorGuiones) {
    throw new Error(`Error al obtener guiones: ${errorGuiones.message}`);
  }

  if (!guiones || guiones.length === 0) {
    return [];
  }

  // 2. Filtrar por nombres de canal si es necesario
  let guionesFiltrados = guiones;
  if (CHANNEL_FILTER.enabled && CHANNEL_FILTER.channels.names.length > 0) {
    guionesFiltrados = guiones.filter(guion => 
      CHANNEL_FILTER.channels.names.includes(guion.canales?.nombre)
    );
  }

  // 2.5. Filtrar solo guiones de canales con generación automática
  guionesFiltrados = guionesFiltrados.filter(guion => 
    guion.canales?.generacion_automatica === true
  );

  if (guionesFiltrados.length === 0) {
    return [];
  }

  // 3. Obtener IDs de guiones que ya tienen video
  const guionesIds = guionesFiltrados.map(g => g.id);
  
  if (guionesIds.length === 0) {
    return [];
  }

  const { data: videos, error: errorVideos } = await supabase
    .from('videos')
    .select('guion_id')
    .in('guion_id', guionesIds);

  if (errorVideos) {
    throw new Error(`Error al verificar videos: ${errorVideos.message}`);
  }

  // 4. Filtrar guiones sin video
  const guionesConVideo = new Set(videos?.map(v => v.guion_id) || []);
  const guionesSinVideo = guionesFiltrados.filter(g => !guionesConVideo.has(g.id));

  return guionesSinVideo;
}

/**
 * Verificar qué assets ya existen para un guión
 */
async function verificarAssetsExistentes(guionId) {
  const { data: assets, error } = await supabase
    .from('media_assets')
    .select('tipo, metadata')
    .eq('guion_id', guionId);

  if (error) {
    throw new Error(`Error al verificar assets: ${error.message}`);
  }

  const tieneAudio = assets?.some(a => a.tipo === 'audio') || false;
  const audioExistente = assets?.find(a => a.tipo === 'audio');
  const duracionAudioExistente = audioExistente?.metadata?.duration_seconds || null;
  
  // Extraer números de escena de las imágenes existentes
  const imagenesExistentes = assets?.filter(a => a.tipo === 'imagen') || [];
  const escemasGeneradas = [];
  
  for (const img of imagenesExistentes) {
    // Intentar extraer escena desde diferentes lugares del metadata
    let escena = null;
    
    if (img.metadata) {
      // Puede estar en metadata.escena (número)
      if (typeof img.metadata.escena === 'number') {
        escena = img.metadata.escena;
      }
      // O puede estar en metadata.seccion (string que contiene número)
      else if (img.metadata.seccion) {
        const match = String(img.metadata.seccion).match(/\d+/);
        if (match) {
          escena = parseInt(match[0], 10);
        }
      }
    }
    
    if (escena !== null) {
      escemasGeneradas.push(escena);
    }
  }

  return {
    tieneAudio,
    duracionAudioExistente,
    imagenesGeneradas: escemasGeneradas,
    totalImagenes: imagenesExistentes.length
  };
}

/**
 * Calcular cuántas imágenes se necesitan según la duración del audio
 */
function calcularCantidadImagenes(duracionAudioSegundos) {
  return Math.ceil(duracionAudioSegundos / DURACION_POR_IMAGEN);
}

/**
 * Generar narración con ElevenLabs
 */
async function generarNarracion(guion) {
  const apiBaseUrl = process.env.API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('API_BASE_URL no configurado');
  }

  const textoNarracion = guion.guion_detallado_json?.narracion?.texto;

  if (!textoNarracion) {
    throw new Error('Guión sin texto de narración');
  }

  console.log(`   🎙️  Generando narración con ElevenLabs...`);

  const response = await fetch(`${apiBaseUrl}/elevenlabs/generate-narration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guion_id: guion.id,
      texto: textoNarracion
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json();

  console.log(`   ✅ Narración generada: ${data.audio.url}`);
  console.log(`   📦 Tamaño: ${(data.audio.size_bytes / 1024).toFixed(2)} KB`);
  console.log(`   ⏱️  Duración: ${data.audio.duration_seconds}s`);

  return data.audio;
}

/**
 * Generar imagen con IA (NanoBanana)
 */
async function generarImagen(guion, escena, descripcion, promptImagen) {
  const apiBaseUrl = process.env.API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('API_BASE_URL no configurado');
  }

  console.log(`   🎨 Generando imagen para escena ${escena}...`);

  // Usar el prompt_imagen si existe, sino construir uno basado en la descripción
  const prompt = promptImagen || 
    `Genera una imagen hiperrealista en estilo hiperrealista 3D. Render cinematográfico con iluminación natural suave. basada en la siguiente descripción: ${descripcion}`;

  const response = await fetch(`${apiBaseUrl}/nanobanana/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guion_id: guion.id,
      escena: escena,
      prompt: prompt
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json();

  console.log(`   ✅ Imagen ${escena} generada: ${data.asset.url}`);
  console.log(`   📦 Tamaño: ${(data.asset.metadata.size_bytes / 1024).toFixed(2)} KB`);

  return data.asset;
}

/**
 * Cambiar estado del guión a 'producir_video'
 */
async function cambiarEstadoGuion(guionId, nuevoEstado) {
  const { error } = await supabase
    .from('guiones')
    .update({ estado: nuevoEstado })
    .eq('id', guionId)
    .eq('tipo_guion', 'corto');

  if (error) {
    throw new Error(`Error al cambiar estado: ${error.message}`);
  }
}

/**
 * Procesar un guión: generar audio e imágenes necesarias
 */
async function procesarGuion(guion) {
  try {
    console.log(`\n📺 Canal: ${guion.canales?.nombre || 'N/A'}`);
    console.log(`   Guión: ${guion.nombre}`);
    console.log(`   ID: ${guion.id}`);

    // 1. Verificar estructura del JSON
    const detalleJson = guion.guion_detallado_json;
    if (!detalleJson || !detalleJson.narracion || !detalleJson.storyboard) {
      throw new Error('Guión sin estructura JSON válida');
    }

    // 2. Verificar assets existentes
    const { tieneAudio, duracionAudioExistente, imagenesGeneradas, totalImagenes } = await verificarAssetsExistentes(guion.id);

    let audioGenerado = tieneAudio;
    let duracionAudio = duracionAudioExistente || detalleJson.narracion.tiempo_fin || 30;

    console.log(`   📊 Assets actuales:`);
    console.log(`      • Audio: ${tieneAudio ? '✅ Ya existe' : '❌ Falta'}`);
    if (tieneAudio && duracionAudioExistente) {
      console.log(`      • Duración audio existente: ${duracionAudioExistente}s`);
    }
    console.log(`      • Imágenes existentes: ${totalImagenes}`);
    if (imagenesGeneradas.length > 0) {
      console.log(`      • Escenas detectadas: [${imagenesGeneradas.sort((a, b) => a - b).join(', ')}]`);
    }

    // 3. Generar audio si no existe
    if (!tieneAudio) {
      try {
        const audio = await generarNarracion(guion);
        audioGenerado = true;
        duracionAudio = audio.duration_seconds || duracionAudio;
      } catch (error) {
        console.error(`   ❌ Error generando audio: ${error.message}`);
        
        await reportarError({
          tipo: TipoError.PROCESSING,
          severidad: Severidad.ERROR,
          mensaje: `Error al generar audio para guión ${guion.nombre}`,
          error: error,
          canalId: guion.canal_id,
          contexto: {
            guion_id: guion.id,
            guion_nombre: guion.nombre
          }
        });

        return { success: false, error: 'Error generando audio' };
      }
    } else {
      console.log(`   ✅ Audio ya existe`);
    }

    // 4. Calcular cuántas imágenes necesitamos
    const cantidadImagenesNecesarias = calcularCantidadImagenes(duracionAudio);
    console.log(`   📊 Duración audio: ${duracionAudio}s → ${cantidadImagenesNecesarias} imágenes necesarias`);

    // 5. Generar imágenes faltantes
    const storyboard = detalleJson.storyboard || [];
    const imagenesGeneradasAhora = [];
    let erroresImagenes = 0;

    for (let i = 0; i < cantidadImagenesNecesarias; i++) {
      const escena = i + 1;

      // Verificar si ya existe
      if (imagenesGeneradas.includes(escena)) {
        console.log(`   ✅ Imagen ${escena} ya existe`);
        continue;
      }

      // Obtener datos de la escena del storyboard
      const escenaData = storyboard[i];
      
      if (!escenaData) {
        console.warn(`   ⚠️  No hay datos de storyboard para escena ${escena}, omitiendo...`);
        continue;
      }

      const descripcion = escenaData.descripcion_imagen || escenaData.prompt_imagen || '';
      const promptImagen = escenaData.prompt_imagen;

      if (!descripcion && !promptImagen) {
        console.warn(`   ⚠️  Escena ${escena} sin descripción, omitiendo...`);
        continue;
      }

      // Generar imagen
      try {
        await generarImagen(guion, escena, descripcion, promptImagen);
        imagenesGeneradasAhora.push(escena);
      } catch (error) {
        console.error(`   ❌ Error generando imagen ${escena}: ${error.message}`);
        erroresImagenes++;

        await reportarError({
          tipo: TipoError.PROCESSING,
          severidad: Severidad.WARNING,
          mensaje: `Error al generar imagen ${escena} para guión ${guion.nombre}`,
          error: error,
          canalId: guion.canal_id,
          contexto: {
            guion_id: guion.id,
            guion_nombre: guion.nombre,
            escena: escena
          }
        });
      }
    }

    // 6. Verificar si todos los assets están completos
    const totalImagenesGeneradas = imagenesGeneradas.length + imagenesGeneradasAhora.length;
    
    // Verificar que tengamos al menos la cantidad necesaria de imágenes
    // O que todas las escenas del storyboard estén cubiertas
    const imagenesCompletadas = new Set([...imagenesGeneradas, ...imagenesGeneradasAhora]);
    const todasEscenasCubiertas = imagenesCompletadas.size >= cantidadImagenesNecesarias;
    
    const assetsCompletos = audioGenerado && todasEscenasCubiertas;

    console.log(`\n   📈 Resumen:`);
    console.log(`      • Audio: ${audioGenerado ? '✅' : '❌'}`);
    console.log(`      • Imágenes únicas: ${imagenesCompletadas.size}/${cantidadImagenesNecesarias}`);
    console.log(`      • Imágenes generadas ahora: ${imagenesGeneradasAhora.length}`);
    console.log(`      • Errores: ${erroresImagenes}`);

    // 7. Cambiar estado si está completo
    if (assetsCompletos) {
      await cambiarEstadoGuion(guion.id, 'producir_video');
      console.log(`   ✅ Estado cambiado a 'producir_video'`);
      return { success: true, cambioEstado: true };
    } else {
      const razon = !audioGenerado 
        ? 'falta audio' 
        : `faltan ${cantidadImagenesNecesarias - imagenesCompletadas.size} imágenes`;
      console.log(`   ⚠️  Assets incompletos (${razon}), manteniendo estado 'generado'`);
      return { success: true, cambioEstado: false };
    }

  } catch (error) {
    console.error(`   ❌ Error procesando guión: ${error.message}`);
    
    await reportarError({
      tipo: TipoError.PROCESSING,
      severidad: Severidad.ERROR,
      mensaje: `Error al procesar guión ${guion.nombre}`,
      error: error,
      canalId: guion.canal_id,
      contexto: {
        guion_id: guion.id,
        guion_nombre: guion.nombre
      }
    });

    return { success: false, error: error.message };
  }
}

/**
 * Proceso principal: Generar assets para guiones
 */
async function generarAssets() {
  // Verificar si ya hay una ejecución en progreso
  if (isGeneratingAssets) {
    console.log('\n⏸️  Generación de assets ya en progreso, omitiendo esta ejecución...\n');
    return;
  }

  // Marcar como en progreso
  isGeneratingAssets = true;

  try {
    console.log('\n' + '='.repeat(80));
    console.log('🎬 GENERACIÓN DE ASSETS (AUDIO E IMÁGENES)');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('='.repeat(80));

    // 1. Obtener guiones que necesitan assets
    const guiones = await obtenerGuionesParaAssets();

    if (guiones.length === 0) {
      console.log('\n⚠️  No hay guiones pendientes de generar assets');
      console.log('    (solo se procesan canales con generacion_automatica = true)\n');
      return;
    }

    console.log(`\n📋 Guiones disponibles para procesar: ${guiones.length}`);
    console.log('    (filtrados por generacion_automatica = true)');

    // 2. Agrupar guiones por canal
    const guionesPorCanal = {};
    for (const guion of guiones) {
      const canalId = guion.canal_id;
      if (!guionesPorCanal[canalId]) {
        guionesPorCanal[canalId] = {
          nombre: guion.canales?.nombre || `Canal ${canalId}`,
          guiones: []
        };
      }
      guionesPorCanal[canalId].guiones.push(guion);
    }

    // 3. Procesar por canal respetando umbral de stock
    let procesados = 0;
    let completados = 0;
    let errores = 0;
    let omitidosPorStock = 0;

    for (const [canalId, canal] of Object.entries(guionesPorCanal)) {
      console.log(`\n📺 Canal: ${canal.nombre} (${canal.guiones.length} guiones disponibles)`);

      // Verificar cuántos videos pendientes tiene este canal
      const videosListos = await contarVideosListos(canalId);
      console.log(`   Stock actual: ${videosListos}/${UMBRAL_VIDEOS_LISTOS} videos pendientes de publicar`);

      if (videosListos >= UMBRAL_VIDEOS_LISTOS) {
        console.log(`   ✅ Stock suficiente, omitiendo este canal`);
        omitidosPorStock += canal.guiones.length;
        continue;
      }

      // Calcular cuántos guiones necesitamos procesar
      const guionesNecesarios = UMBRAL_VIDEOS_LISTOS - videosListos;
      const guionesAProcesar = canal.guiones.slice(0, guionesNecesarios);
      
      console.log(`   🎯 Necesarios: ${guionesNecesarios}, procesando: ${guionesAProcesar.length}`);

      // Procesar guiones del canal hasta alcanzar el umbral
      for (const guion of guionesAProcesar) {
        console.log('\n' + '─'.repeat(80));
        
        const resultado = await procesarGuion(guion);
        
        procesados++;
        
        if (resultado.success) {
          if (resultado.cambioEstado) {
            completados++;
          }
        } else {
          errores++;
        }

        // Verificar si ya alcanzamos el stock necesario
        const stockActual = await contarVideosListos(canalId);
        if (stockActual >= UMBRAL_VIDEOS_LISTOS) {
          console.log(`\n   ✅ Stock alcanzado (${stockActual}/${UMBRAL_VIDEOS_LISTOS} videos), pasando al siguiente canal`);
          break;
        }
      }
    }

    // 4. Resumen final
    console.log('\n' + '='.repeat(80));
    console.log('✅ GENERACIÓN DE ASSETS COMPLETADA');
    console.log(`   Guiones procesados: ${procesados}`);
    console.log(`   Completados (→ producir_video): ${completados}`);
    console.log(`   Con errores: ${errores}`);
    console.log(`   Omitidos por stock suficiente: ${omitidosPorStock}`);
    console.log(`   Pendientes: ${procesados - completados - errores}`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR EN GENERACIÓN DE ASSETS:', error.message);
    console.error('Stack trace:', error.stack);

    await reportarError({
      tipo: TipoError.PROCESSING,
      severidad: Severidad.CRITICAL,
      mensaje: 'Error en proceso de generación de assets',
      error: error
    });
  } finally {
    // Liberar lock siempre, incluso si hay error
    isGeneratingAssets = false;
  }
}

module.exports = {
  generarAssets
};
