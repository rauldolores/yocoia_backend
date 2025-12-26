const fs = require('fs');
const path = require('path');
const { agregarMusicaDeFondo } = require('../audio');
const { FACEBOOK_ACCESS_TOKEN } = require('../../config');

/**
 * Publicar video en Facebook con API Graph v18.0 (upload resumible en 3 fases)
 * @param {Object} video - Objeto del video con titulo, descripcion, metadata
 * @param {Object} canal - Objeto del canal con nombre, credenciales, musica_fondo_facebook_url
 * @param {string} rutaVideoLocal - Ruta local del video
 * @returns {Promise<string>} - ID del post en Facebook
 */
async function publicarEnFacebook(video, canal, rutaVideoLocal) {
  console.log('📘 Publicando en Facebook...');
  
  let rutaVideoConMusica = null;
  
  try {
    console.log(`   Página: ${canal.nombre}`);
    
    // Usar título específico de Facebook desde metadata, o el título general como fallback
    let tituloFacebook = video.metadata?.titulo_facebook || video.titulo || 'Video sin título';
    
    // Validar que el título no esté vacío
    if (!tituloFacebook || tituloFacebook.trim() === '') {
      tituloFacebook = 'Video sin título';
    }
    
    // Limpiar título
    tituloFacebook = tituloFacebook.trim();
    
    // Facebook también tiene límite de 100 caracteres para mejor visualización
    const MAX_TITULO_LENGTH = 100;
    
    // Si el título es muy largo, intentar quitando hashtags progresivamente
    if (tituloFacebook.length > MAX_TITULO_LENGTH) {
      console.log(`   ⚠️  Título muy largo (${tituloFacebook.length} caracteres), ajustando...`);
      
      // Extraer todos los hashtags
      const hashtagRegex = /#\w+/g;
      const hashtags = tituloFacebook.match(hashtagRegex) || [];
      
      // Intentar quitar hashtags del final uno por uno
      let tituloAjustado = tituloFacebook;
      for (let i = hashtags.length - 1; i >= 0 && tituloAjustado.length > MAX_TITULO_LENGTH; i--) {
        const hashtagAQuitar = hashtags[i];
        // Quitar el hashtag y limpiar espacios extra
        tituloAjustado = tituloAjustado.replace(hashtagAQuitar, '').replace(/\s+/g, ' ').trim();
        console.log(`   🗑️  Quitando hashtag: ${hashtagAQuitar} (longitud: ${tituloAjustado.length})`);
      }
      
      // Si aún es muy largo después de quitar todos los hashtags, truncar
      if (tituloAjustado.length > MAX_TITULO_LENGTH) {
        console.log(`   ✂️  Aún muy largo (${tituloAjustado.length} caracteres), truncando...`);
        tituloFacebook = tituloAjustado.substring(0, MAX_TITULO_LENGTH).trim();
      } else {
        // Si ya cumple con la longitud después de quitar hashtags, usarlo
        tituloFacebook = tituloAjustado;
      }
      
      console.log(`   ✅ Título ajustado a ${tituloFacebook.length} caracteres`);
    }
    
    console.log(`   📝 Título Facebook (${tituloFacebook.length} chars): "${tituloFacebook}"`);
    
    // Agregar música de fondo
    let rutaVideoFinal = rutaVideoLocal;
    console.log('   🎵 Buscando música de fondo para Facebook (32% volumen)...');
    
    const { obtenerMusicaAleatoria } = require('../../database/musica');
    const tipoContenido = 'video_corto'; // Facebook solo publica videos cortos
    const musica = await obtenerMusicaAleatoria(tipoContenido, 'facebook');
    
    if (musica) {
      console.log(`   🎵 Agregando música: "${musica.nombre}"`);
      rutaVideoConMusica = rutaVideoLocal.replace('.mp4', '_facebook_musica.mp4');
      
      await agregarMusicaDeFondo(
        rutaVideoLocal,
        musica.archivo_url,
        rutaVideoConMusica,
        0.32 // 32% volumen
      );
      
      rutaVideoFinal = rutaVideoConMusica;
      console.log(`   ✅ Video con música listo: ${path.basename(rutaVideoFinal)}`);
    } else {
      console.log('   ⚠️  No hay música disponible, publicando sin música de fondo');
    }

    // Verificar credenciales de Facebook
    const credenciales = canal.credenciales?.facebook;
    
    console.log(`   🔍 DEBUG credenciales: ${JSON.stringify(credenciales, null, 2)}`);
    console.log(`   🔍 DEBUG canal.page_id: ${canal.page_id}`);
    console.log(`   🔍 DEBUG FACEBOOK_ACCESS_TOKEN disponible: ${Boolean(FACEBOOK_ACCESS_TOKEN)}`);
    
    if (!credenciales || !credenciales.page_id || !credenciales.access_token) {
      throw new Error('Canal no tiene credenciales de Facebook configuradas (necesita page_id y access_token en canal.credenciales.facebook)');
    }

    const { page_id, access_token } = credenciales;

    console.log(`   🔐 page_id: ${page_id}`);
    console.log(`   🔐 access_token: ${access_token}`);
    console.log(`   🔐 Token length: ${access_token.length} caracteres`);
    
    // Obtener información del archivo
    const fileSize = fs.statSync(rutaVideoFinal).size;
    console.log(`   📊 Tamaño del video: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    
    const videoBuffer = fs.readFileSync(rutaVideoFinal);
    const descripcion = video.descripcion || '';
    
    console.log(`   📤 Iniciando subida a Facebook...`);
    console.log(`   🎬 Formato: Reel (9:16, vertical)`);
    
    // FASE 1: Inicializar sesión de subida
    console.log('   [1/3] Iniciando sesión de subida...');
    const initUrl = `https://graph.facebook.com/v18.0/${page_id}/videos`;
    const initParams = new URLSearchParams({
      upload_phase: 'start',
      access_token: access_token,
      file_size: fileSize.toString()
    });
    
    const initResponse = await fetch(`${initUrl}?${initParams.toString()}`, {
      method: 'POST'
    });
    
    if (!initResponse.ok) {
      const errorData = await initResponse.json();
      throw new Error(`Error al iniciar sesión de subida: ${JSON.stringify(errorData)}`);
    }
    
    const initData = await initResponse.json();
    const { video_id, upload_session_id } = initData;
    
    if (!video_id || !upload_session_id) {
      throw new Error('No se recibió video_id o upload_session_id de Facebook');
    }
    
    console.log(`   ✅ Sesión iniciada - video_id: ${video_id}`);
    
    // FASE 2: Transferir el archivo de video
    console.log('   [2/3] Transfiriendo video...');
    
    const FormData = require('form-data');
    const https = require('https');
    const { URL } = require('url');
    
    const transferForm = new FormData();
    transferForm.append('upload_phase', 'transfer');
    transferForm.append('upload_session_id', upload_session_id);
    transferForm.append('start_offset', '0');
    transferForm.append('access_token', access_token);
    transferForm.append('video_file_chunk', videoBuffer, {
      filename: path.basename(rutaVideoFinal),
      contentType: 'video/mp4'
    });

    // Usar el método submit() de form-data en lugar de fetch()
    // Esto maneja correctamente el streaming y los headers
    const transferResponse = await new Promise((resolve, reject) => {
      const parsedUrl = new URL(initUrl);
      
      transferForm.submit({
        host: parsedUrl.host,
        path: parsedUrl.pathname,
        protocol: parsedUrl.protocol,
        method: 'POST'
      }, (err, res) => {
        if (err) return reject(err);
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          res.body = data;
          resolve(res);
        });
        res.on('error', reject);
      });
    });
    
    if (transferResponse.statusCode !== 200) {
      const errorData = JSON.parse(transferResponse.body);
      throw new Error(`Error al transferir video: ${JSON.stringify(errorData)}`);
    }
    
    console.log(`   ✅ Video transferido exitosamente`);
    
    // FASE 3: Finalizar subida con título y descripción
    console.log('   [3/3] Finalizando publicación...');
    const finishParams = new URLSearchParams({
      upload_phase: 'finish',
      upload_session_id: upload_session_id,
      access_token: access_token,
      title: tituloFacebook,
      description: descripcion
    });
    
    const finishResponse = await fetch(`${initUrl}?${finishParams.toString()}`, {
      method: 'POST'
    });
    
    if (!finishResponse.ok) {
      const errorData = await finishResponse.json();
      throw new Error(`Error al finalizar publicación: ${JSON.stringify(errorData)}`);
    }
    
    console.log(`   ✅ Video publicado exitosamente!`);
    console.log(`   🔗 Video ID: ${video_id}`);
    console.log(`   📱 URL: https://facebook.com/${video_id}`);
    
    return video_id;
    
  } catch (error) {
    console.error('❌ Error al publicar en Facebook:', error.message);
    if (error.response) {
      console.error('   Detalles:', error.response);
    }
    throw error;
  } finally {
    // Limpiar video temporal con música
    if (rutaVideoConMusica && fs.existsSync(rutaVideoConMusica)) {
      try {
        fs.unlinkSync(rutaVideoConMusica);
        console.log('   🧹 Video temporal con música eliminado');
      } catch (e) {
        console.warn('   ⚠️  No se pudo eliminar video temporal:', e.message);
      }
    }
  }
}

module.exports = {
  publicarEnFacebook
};
