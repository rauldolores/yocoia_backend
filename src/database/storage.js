const { supabase } = require('../config');
const fsPromises = require('fs').promises;
const http = require('http');
const https = require('https');
const fs = require('fs');

/**
 * Subir video a Supabase Storage
 * @param {string} rutaVideoLocal - Ruta local del video
 * @param {string} guionId - ID del guion
 * @returns {Promise<Object>} - Información del video subido
 */
async function subirVideoAStorage(rutaVideoLocal, guionId) {
  console.log('📤 Subiendo video a Supabase Storage...');
  
  try {
    // Leer el archivo de video
    const videoBuffer = await fsPromises.readFile(rutaVideoLocal);
    const videoSizeBytes = videoBuffer.length;
    
    // Generar nombre de archivo único
    const timestamp = Date.now();
    const filename = `video_${guionId}_${timestamp}.mp4`;
    const storagePath = `videos/${filename}`;
    
    // Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('media-assets')
      .upload(storagePath, videoBuffer, {
        contentType: 'video/mp4',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Error subiendo video a Storage:', uploadError);
      throw new Error('Error al subir video a Storage');
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('media-assets')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;
    console.log(`✅ Video subido a Storage: ${publicUrl}`);
    
    return {
      storage_path: storagePath,
      url: publicUrl,
      size_bytes: videoSizeBytes
    };
    
  } catch (error) {
    console.error('❌ Error al subir video:', error.message);
    throw error;
  }
}

/**
 * Descargar video desde Supabase Storage
 * @param {string} videoUrl - URL del video
 * @param {string} destino - Ruta local de destino
 * @returns {Promise<string>} - Ruta del archivo descargado
 */
async function descargarVideoParaPublicar(videoUrl, destino) {
  console.log('⬇️  Descargando video desde Storage...');
  
  return new Promise((resolve, reject) => {
    const protocolo = videoUrl.startsWith('https') ? https : http;
    const archivo = fs.createWriteStream(destino);

    protocolo.get(videoUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Error al descargar video: ${response.statusCode}`));
        return;
      }

      response.pipe(archivo);

      archivo.on('finish', () => {
        archivo.close();
        console.log(`✅ Video descargado: ${destino}`);
        resolve(destino);
      });
    }).on('error', (error) => {
      fs.unlinkSync(destino);
      reject(error);
    });
  });
}

/**
 * Guardar referencia de audio en media_assets
 * @param {string} guionId - ID del guion
 * @param {string} storagePath - Ruta en Storage
 * @param {string} publicUrl - URL pública
 * @param {Object} metadata - Metadata adicional
 * @returns {Promise<Object>} - Media asset creado
 */
async function guardarMediaAssetAudio(guionId, storagePath, publicUrl, metadata) {
  try {
    const { data: mediaAsset, error: dbError } = await supabase
      .from('media_assets')
      .insert({
        guion_id: guionId,
        tipo: 'audio',
        storage_path: storagePath,
        url: publicUrl,
        metadata: metadata
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ Error guardando en DB:', dbError);
      throw new Error('Error al guardar referencia en base de datos');
    }

    console.log('✅ Referencia guardada en media_assets');
    return mediaAsset;
  } catch (error) {
    console.error('❌ Error al guardar media asset:', error.message);
    throw error;
  }
}

/**
 * Subir audio a Supabase Storage
 * @param {Buffer} audioBuffer - Buffer del audio
 * @param {string} guionId - ID del guion
 * @returns {Promise<Object>} - Información del audio subido
 */
async function subirAudioAStorage(audioBuffer, guionId) {
  try {
    // Generar nombre de archivo único
    const timestamp = Date.now();
    const filename = `narracion_${guionId}_${timestamp}.mp3`;
    const storagePath = `audio/narracion/${filename}`;

    // Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('media-assets')
      .upload(storagePath, audioBuffer, {
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

    return {
      storage_path: storagePath,
      url: publicUrl
    };
  } catch (error) {
    console.error('❌ Error al subir audio:', error.message);
    throw error;
  }
}

module.exports = {
  subirVideoAStorage,
  descargarVideoParaPublicar,
  guardarMediaAssetAudio,
  subirAudioAStorage
};
