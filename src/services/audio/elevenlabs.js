/**
 * Servicio de generación de audio con ElevenLabs
 */

const fetch = require('node-fetch');
const { supabase, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } = require('../../config');

/**
 * Extraer texto del guion para generar narración
 * @param {Object} guion - Objeto del guion
 * @returns {string} - Texto extraído del guion
 */
function extraerTextoDelGuion(guion) {
  // Intentar obtener texto de diferentes campos posibles
  if (guion.guion_detallado_json) {
    const guionDetallado = guion.guion_detallado_json;
    
    // Buscar el campo de narración o texto
    if (guionDetallado.narracion) {
      return guionDetallado.narracion;
    }
    
    if (guionDetallado.texto) {
      return guionDetallado.texto;
    }
    
    // Si tiene escenas, concatenar todas las narraciones
    if (guionDetallado.escenas && Array.isArray(guionDetallado.escenas)) {
      return guionDetallado.escenas
        .map(escena => escena.narracion || escena.texto || '')
        .filter(texto => texto.length > 0)
        .join(' ');
    }
  }
  
  // Si tiene prompt generado, usarlo
  if (guion.prompt_generado) {
    return guion.prompt_generado;
  }
  
  // Si tiene descripción
  if (guion.descripcion) {
    return guion.descripcion;
  }
  
  return '';
}

/**
 * Generar audio con ElevenLabs
 * @param {string} guionId - ID del guion
 * @param {string} texto - Texto para generar audio
 * @returns {Promise<Object>} - Objeto con información del audio generado
 */
async function generarAudioConElevenLabs(guionId, texto) {
  console.log('🎙️ Generando narración con ElevenLabs Multilingual v2...');
  console.log(`   Voice ID: ${ELEVENLABS_VOICE_ID}`);
  console.log(`   Texto length: ${texto.length} caracteres`);
  
  try {
    // Llamar a ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: texto,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error de ElevenLabs:', errorText);
      throw new Error(`Error de ElevenLabs: ${response.status} - ${errorText}`);
    }

    // Convertir respuesta a buffer
    const audioBuffer = await response.arrayBuffer();
    console.log(`✅ Audio generado: ${audioBuffer.byteLength} bytes`);

    // Generar nombre de archivo único
    const timestamp = Date.now();
    const filename = `narracion_${guionId}_${timestamp}.mp3`;
    const storagePath = `audio/narracion/${filename}`;

    // Convertir ArrayBuffer a Buffer de Node.js
    const buffer = Buffer.from(audioBuffer);

    // Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('media-assets')
      .upload(storagePath, buffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Error subiendo a Storage:', uploadError);
      throw new Error('Error al subir audio a Storage');
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('media-assets')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;
    console.log(`📦 Audio subido a Storage: ${publicUrl}`);

    // Guardar referencia en media_assets
    const { data: mediaAsset, error: dbError } = await supabase
      .from('media_assets')
      .insert({
        guion_id: guionId,
        tipo: 'audio',
        storage_path: storagePath,
        url: publicUrl,
        metadata: {
          tipo: 'narracion',
          voice_id: ELEVENLABS_VOICE_ID,
          model: 'eleven_multilingual_v2',
          texto_length: texto.length,
          size_bytes: audioBuffer.byteLength,
        },
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ Error guardando en DB:', dbError);
      throw new Error('Error al guardar referencia en base de datos');
    }

    console.log('✅ Referencia guardada en media_assets');

    return {
      id: mediaAsset.id,
      url: publicUrl,
      storage_path: storagePath,
    };
    
  } catch (error) {
    console.error('❌ Error al generar audio con ElevenLabs:', error.message);
    throw error;
  }
}

module.exports = {
  extraerTextoDelGuion,
  generarAudioConElevenLabs
};
