const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI } = require('../../config');
const { agregarMusicaDeFondo } = require('../audio');

/**
 * Publicar video en YouTube con configuración de Shorts
 * @param {Object} video - Objeto del video con titulo, descripcion, metadata
 * @param {Object} canal - Objeto del canal con nombre, credenciales, musica_fondo_youtube_url
 * @param {string} rutaVideoLocal - Ruta local del video
 * @returns {Promise<string>} - ID del video en YouTube
 */
async function publicarEnYouTube(video, canal, rutaVideoLocal) {
  console.log('\n   📺 Publicando en YouTube... [MÓDULO REFACTORIZADO]');
  console.log('   🔍 DEBUG - Video completo:', JSON.stringify(video, null, 2));
  console.log('   🔍 DEBUG - video.titulo:', video.titulo);
  console.log('   🔍 DEBUG - video.metadata:', JSON.stringify(video.metadata, null, 2));

  let rutaVideoConMusica = null; // Declarar fuera del try para acceso en finally

  try {
    const credenciales = canal.credenciales?.youtube;
    if (!credenciales?.refresh_token) {
      throw new Error('No hay credenciales de YouTube configuradas para este canal');
    }

    let rutaVideoFinal = rutaVideoLocal;

    // Procesar música de fondo si está configurada
    if (canal.musica_fondo_youtube_url) {
      console.log('   🎵 Canal tiene música de fondo configurada');
      rutaVideoConMusica = rutaVideoLocal.replace('.mp4', '_con_musica.mp4');
      
      const { agregarMusicaDeFondo } = require('../audio');
      rutaVideoFinal = await agregarMusicaDeFondo(
        rutaVideoLocal,
        canal.musica_fondo_youtube_url,
        rutaVideoConMusica
      );
    }

    // Configurar OAuth2
    const oauth2Client = new google.auth.OAuth2(
      YOUTUBE_CLIENT_ID,
      YOUTUBE_CLIENT_SECRET,
      YOUTUBE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: credenciales.refresh_token
    });

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });

    // Extraer título correcto desde metadata o fallback
    let tituloYouTube = null;
    
    // Prioridad 1: metadata.titulo_youtube
    if (video.metadata?.titulo_youtube) {
      tituloYouTube = video.metadata.titulo_youtube;
    }
    // Prioridad 2: campo titulo directo
    else if (video.titulo) {
      tituloYouTube = video.titulo;
    }
    // Prioridad 3: fallback
    else {
      tituloYouTube = 'Video sin título';
    }

    // Validación extra: asegurar que no esté vacío
    if (!tituloYouTube || tituloYouTube.trim() === '') {
      console.log('   ⚠️  Título vacío detectado, usando fallback');
      tituloYouTube = 'Video sin título';
    }

    // Limpiar y validar el título
    tituloYouTube = tituloYouTube.trim();

    // Agregar #Shorts si no lo tiene
    let tituloFinal = tituloYouTube.includes('#Shorts') 
      ? tituloYouTube 
      : `${tituloYouTube} #Shorts`;

    // YouTube tiene límite de 100 caracteres para títulos
    const MAX_TITULO_LENGTH = 100;
    
    // Si el título es muy largo, intentar quitando hashtags progresivamente
    if (tituloFinal.length > MAX_TITULO_LENGTH) {
      console.log(`   ⚠️  Título muy largo (${tituloFinal.length} caracteres), ajustando...`);
      
      // Extraer todos los hashtags (excepto #Shorts que queremos mantener)
      const hashtagRegex = /#\w+/g;
      const hashtags = tituloFinal.match(hashtagRegex) || [];
      const hashtagsSinShorts = hashtags.filter(tag => tag !== '#Shorts');
      
      // Intentar quitar hashtags del final uno por uno
      let tituloAjustado = tituloFinal;
      for (let i = hashtagsSinShorts.length - 1; i >= 0 && tituloAjustado.length > MAX_TITULO_LENGTH; i--) {
        const hashtagAQuitar = hashtagsSinShorts[i];
        // Quitar el hashtag y limpiar espacios extra
        tituloAjustado = tituloAjustado.replace(hashtagAQuitar, '').replace(/\s+/g, ' ').trim();
        console.log(`   🗑️  Quitando hashtag: ${hashtagAQuitar} (longitud: ${tituloAjustado.length})`);
      }
      
      // Si aún es muy largo después de quitar todos los hashtags, truncar
      if (tituloAjustado.length > MAX_TITULO_LENGTH) {
        console.log(`   ✂️  Aún muy largo (${tituloAjustado.length} caracteres), truncando...`);
        
        // Si el título incluye #Shorts, mantenerlo al truncar
        if (tituloAjustado.includes('#Shorts')) {
          // Truncar dejando espacio para " #Shorts" (8 caracteres)
          const espacioDisponible = MAX_TITULO_LENGTH - 8;
          const tituloSinShorts = tituloAjustado.replace(' #Shorts', '').trim();
          tituloFinal = tituloSinShorts.substring(0, espacioDisponible).trim() + ' #Shorts';
        } else {
          // Truncar directamente si no tiene #Shorts
          tituloFinal = tituloAjustado.substring(0, MAX_TITULO_LENGTH).trim();
        }
      } else {
        // Si ya cumple con la longitud después de quitar hashtags, usarlo
        tituloFinal = tituloAjustado;
      }
      
      console.log(`   ✅ Título ajustado a ${tituloFinal.length} caracteres`);
    }

    console.log(`   📝 Título final (${tituloFinal.length} chars): "${tituloFinal}"`);
    console.log(`   📄 Descripción: ${video.descripcion?.substring(0, 50)}...`);

    // Log adicional para debug
    console.log(`   🔍 Debug - video.metadata:`, JSON.stringify(video.metadata, null, 2));
    console.log(`   🔍 Debug - video.titulo:`, video.titulo);

    const fileSize = fs.statSync(rutaVideoFinal).size;
    console.log(`   📦 Tamaño del archivo: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    // Preparar metadata del video
    const snippet = {
      title: tituloFinal,
      description: video.descripcion || '',
      categoryId: '22',
      defaultLanguage: 'es',
      tags: ['Shorts', 'Short', 'Vertical']
    };

    console.log(`   ⬆️  Subiendo video a YouTube...`);

    // Subir video
    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: snippet,
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.createReadStream(rutaVideoFinal)
      }
    });

    const videoId = response.data.id;
    
    console.log(`   ✅ Video subido exitosamente`);
    console.log(`   🔗 URL: https://youtube.com/watch?v=${videoId}`);
    console.log(`   🔗 URL Short: https://youtube.com/shorts/${videoId}`);

    return videoId;

  } catch (error) {
    console.error('   ❌ Error al publicar en YouTube:', error.message);
    if (error.response?.data) {
      console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  } finally {
    // Limpiar archivo temporal con música
    if (rutaVideoConMusica && fs.existsSync(rutaVideoConMusica)) {
      fs.unlinkSync(rutaVideoConMusica);
      console.log('   🧹 Video temporal con música eliminado');
    }
  }
}

module.exports = {
  publicarEnYouTube
};
