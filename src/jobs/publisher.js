const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { TEMP_DIR, TIMEZONE } = require('../config');
const { obtenerFechaMexico } = require('../utils/date');
const { obtenerVideosListosParaPublicar, actualizarVideoPublicado } = require('../database');
const { descargarVideoParaPublicar } = require('../database');
const { publicarEnYouTube, publicarEnFacebook } = require('../services/publishing');
const { reportarError, reportarPublicacion, TipoError, Severidad } = require('../services/heartbeat');

/**
 * Proceso principal de publicación en redes sociales
 */
async function publicarEnRedesSociales() {
  console.log('\n' + '='.repeat(80));
  console.log('📱 INICIANDO PUBLICACIÓN EN REDES SOCIALES');
  console.log('⏰ Timestamp México:', obtenerFechaMexico().toLocaleString('es-MX', { timeZone: TIMEZONE }));
  console.log('='.repeat(80) + '\n');

  const tempPublicacion = path.join(TEMP_DIR, `publicacion_${Date.now()}`);

  try {
    // Crear directorio temporal
    if (!fs.existsSync(tempPublicacion)) {
      fs.mkdirSync(tempPublicacion, { recursive: true });
    }

    // 1. Obtener videos listos para publicar
    console.log('📋 Consultando videos listos para publicar...');
    const videos = await obtenerVideosListosParaPublicar();

    if (!videos || videos.length === 0) {
      console.log('⚠️  No hay videos listos para publicar en este momento');
      return;
    }

    console.log(`✅ ${videos.length} video(s) listo(s) para publicar\n`);

    // 2. Publicar cada video en ambas plataformas
    let publicadosYouTube = 0;
    let publicadosFacebook = 0;
    let erroresYouTube = 0;
    let erroresFacebook = 0;

    for (const video of videos) {
      const canal = video.guiones.canales;

      console.log('─'.repeat(80));
      console.log(`📹 Publicando: ${video.titulo}`);
      console.log(`   Canal: ${canal.nombre} (ID: ${canal.id})`);
      console.log(`   Programado: ${new Date(video.publicacion_programada_at).toLocaleString('es-MX')}`);
      
      // Verificar qué plataformas ya están publicadas (NULL o string vacío = no publicado)
      const yaPublicadoYouTube = video.youtube_video_id != null && video.youtube_video_id.trim() !== '';
      const yaPublicadoFacebook = video.facebook_post_id != null && video.facebook_post_id.trim() !== '';
      
      if (yaPublicadoYouTube) {
        console.log('   ⏭️  YouTube: Ya publicado (ID: ' + video.youtube_video_id + ')');
      }
      if (yaPublicadoFacebook) {
        console.log('   ⏭️  Facebook: Ya publicado (ID: ' + video.facebook_post_id + ')');
      }

      try {
        // Descargar video una sola vez (solo si hay algo pendiente de publicar)
        const rutaVideoLocal = path.join(tempPublicacion, `video_${video.id}.mp4`);
        await descargarVideoParaPublicar(video.video_url, rutaVideoLocal);

        // Publicar en YouTube (con música de fondo) - solo si no está publicado
        if (!yaPublicadoYouTube) {
          console.log('\n   📺 Publicando en YouTube...');
          const inicioYT = Date.now();
          try {
            const youtubeId = await publicarEnYouTube(video, canal, rutaVideoLocal);
            if (youtubeId) {
              await actualizarVideoPublicado(video.id, 'youtube', youtubeId);
              publicadosYouTube++;
              console.log('   ✅ Publicado en YouTube');
              
              // Reportar publicación exitosa
              const duracionYT = Math.round((Date.now() - inicioYT) / 1000);
              await reportarPublicacion({
                videoId: video.id,
                canalId: canal.id,
                plataforma: 'youtube',
                url: `https://youtube.com/watch?v=${youtubeId}`,
                duracionSegundos: duracionYT,
                metadata: {
                  video_id_plataforma: youtubeId,
                  titulo: video.titulo
                }
              });
            }
          } catch (errorYT) {
            console.error('   ❌ Error en YouTube:', errorYT.message);
            erroresYouTube++;
            
            // Reportar error
            await reportarError({
              tipo: TipoError.UPLOAD,
              severidad: Severidad.ERROR,
              mensaje: `Error al publicar en YouTube: ${errorYT.message}`,
              error: errorYT,
              canalId: canal.id,
              videoId: video.id,
              contexto: {
                plataforma: 'youtube',
                video_titulo: video.titulo,
                canal_nombre: canal.nombre
              }
            });
          }
        }

        // Publicar en Facebook (video original sin música) - solo si no está publicado
        if (!yaPublicadoFacebook) {
          console.log('\n   📘 Publicando en Facebook...');
          const inicioFB = Date.now();
          try {
            const facebookId = await publicarEnFacebook(video, canal, rutaVideoLocal);
            if (facebookId) {
              await actualizarVideoPublicado(video.id, 'facebook', facebookId);
              publicadosFacebook++;
              console.log('   ✅ Publicado en Facebook');
              
              // Reportar publicación exitosa
              const duracionFB = Math.round((Date.now() - inicioFB) / 1000);
              await reportarPublicacion({
                videoId: video.id,
                canalId: canal.id,
                plataforma: 'facebook',
                url: `https://facebook.com/${facebookId}`,
                duracionSegundos: duracionFB,
                metadata: {
                  video_id_plataforma: facebookId,
                  titulo: video.titulo
                }
              });
            }
          } catch (errorFB) {
            console.error('   ❌ Error en Facebook:', errorFB.message);
            erroresFacebook++;
            
            // Reportar error
            await reportarError({
              tipo: TipoError.UPLOAD,
              severidad: Severidad.ERROR,
              mensaje: `Error al publicar en Facebook: ${errorFB.message}`,
              error: errorFB,
              canalId: canal.id,
              videoId: video.id,
              contexto: {
                plataforma: 'facebook',
                video_titulo: video.titulo,
                canal_nombre: canal.nombre
              }
            });
          }
        }

        // Eliminar archivo temporal del video
        if (fs.existsSync(rutaVideoLocal)) {
          fs.unlinkSync(rutaVideoLocal);
        }

        console.log(`\n✅ Proceso completado para este video\n`);

      } catch (error) {
        console.error(`❌ Error general publicando video ${video.id}:`, error.message);
        if (!yaPublicadoYouTube) erroresYouTube++;
        if (!yaPublicadoFacebook) erroresFacebook++;
        
        // Reportar error general
        await reportarError({
          tipo: TipoError.PROCESSING,
          severidad: Severidad.ERROR,
          mensaje: `Error general al publicar video: ${error.message}`,
          error: error,
          canalId: canal?.id,
          videoId: video.id,
          contexto: {
            video_titulo: video.titulo,
            canal_nombre: canal?.nombre
          }
        });
        
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log('✅ PUBLICACIÓN COMPLETADA');
    console.log('   📺 YouTube:');
    console.log(`      Publicados: ${publicadosYouTube}`);
    console.log(`      Errores: ${erroresYouTube}`);
    console.log('   📘 Facebook:');
    console.log(`      Publicados: ${publicadosFacebook}`);
    console.log(`      Errores: ${erroresFacebook}`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR EN PUBLICACIÓN:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Limpiar directorio temporal
    if (fs.existsSync(tempPublicacion)) {
      try {
        await fsPromises.rm(tempPublicacion, { recursive: true, force: true });
      } catch (cleanError) {
        console.error('⚠️  Error al limpiar directorio temporal:', cleanError.message);
      }
    }
  }
}

module.exports = {
  publicarEnRedesSociales
};
