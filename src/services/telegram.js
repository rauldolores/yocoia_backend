/**
 * Servicio de Notificaciones de Telegram
 * 
 * Envía notificaciones a Telegram sobre eventos importantes del sistema:
 * - Publicaciones exitosas
 * - Errores durante procesamiento
 * - Alertas del sistema
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Verificar si Telegram está configurado
 */
function isTelegramEnabled() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

/**
 * Enviar mensaje a Telegram
 * @param {string} message - Mensaje a enviar
 * @param {string} parseMode - 'HTML' o 'Markdown'
 * @returns {Promise<boolean>} - true si se envió exitosamente
 */
async function enviarMensajeTelegram(message, parseMode = 'HTML') {
  if (!isTelegramEnabled()) {
    console.log('⚠️  Telegram no configurado, mensaje no enviado');
    return false;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: parseMode,
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Error al enviar mensaje a Telegram:', errorData);
      return false;
    }

    console.log('✅ Mensaje enviado a Telegram');
    return true;
  } catch (error) {
    console.error('❌ Error al conectar con Telegram:', error.message);
    return false;
  }
}

/**
 * Notificar publicación exitosa de video
 * @param {Object} params - Parámetros de la publicación
 */
async function notificarPublicacionExitosa({ canal, titulo, plataforma, videoId, tipoContenido }) {
  const emoji = plataforma === 'youtube' ? '📺' : '📘';
  const tipo = tipoContenido === 'video_largo' ? '🎬 Video Largo' : '📱 Short';
  
  let urlVideo = '';
  if (plataforma === 'youtube') {
    urlVideo = tipoContenido === 'video_largo' 
      ? `https://youtube.com/watch?v=${videoId}`
      : `https://youtube.com/shorts/${videoId}`;
  } else if (plataforma === 'facebook') {
    urlVideo = `https://facebook.com/${videoId}`;
  }

  const mensaje = `${emoji} <b>INFO: Video Publicado</b>

${tipo}
<b>Canal:</b> ${canal}
<b>Plataforma:</b> ${plataforma.toUpperCase()}
<b>Título:</b> ${titulo}

🔗 <a href="${urlVideo}">Ver video</a>`;

  await enviarMensajeTelegram(mensaje);
}

/**
 * Notificar error durante procesamiento
 * @param {Object} params - Parámetros del error
 */
async function notificarError({ tipo, mensaje, contexto, error }) {
  let emoji = '❌';
  
  switch (tipo) {
    case 'generacion_video':
      emoji = '🎬';
      break;
    case 'publicacion':
      emoji = '📤';
      break;
    case 'generacion_assets':
      emoji = '🎨';
      break;
    case 'generacion_guion':
      emoji = '📝';
      break;
    default:
      emoji = '❌';
  }

  let mensajeCompleto = `${emoji} <b>ERROR: ${tipo.replace(/_/g, ' ').toUpperCase()}</b>

<b>Mensaje:</b> ${mensaje}`;

  if (contexto) {
    mensajeCompleto += `\n<b>Contexto:</b> ${contexto}`;
  }

  if (error && error.message) {
    mensajeCompleto += `\n\n<b>Detalle técnico:</b>\n<code>${error.message}</code>`;
  }

  await enviarMensajeTelegram(mensajeCompleto);
}

/**
 * Notificar alerta informativa
 * @param {string} titulo - Título de la alerta
 * @param {string} mensaje - Mensaje de la alerta
 */
async function notificarInfo(titulo, mensaje) {
  const mensajeCompleto = `ℹ️ <b>INFO: ${titulo}</b>

${mensaje}`;

  await enviarMensajeTelegram(mensajeCompleto);
}

/**
 * Notificar inicio de procesamiento de video largo
 * @param {Object} params - Parámetros del guion
 */
async function notificarInicioVideoLargo({ canal, titulo, numSecciones }) {
  const mensaje = `🎬 <b>INFO: Iniciando Video Largo</b>

<b>Canal:</b> ${canal}
<b>Título:</b> ${titulo}
<b>Secciones:</b> ${numSecciones}

⏳ Procesando...`;

  await enviarMensajeTelegram(mensaje);
}

/**
 * Notificar video largo completado
 * @param {Object} params - Parámetros del video completado
 */
async function notificarVideoLargoCompletado({ canal, titulo, duracion, tamanoMB }) {
  const duracionMin = Math.floor(duracion / 60);
  const duracionSeg = Math.round(duracion % 60);
  
  const mensaje = `✅ <b>INFO: Video Largo Completado</b>

<b>Canal:</b> ${canal}
<b>Título:</b> ${titulo}
<b>Duración:</b> ${duracionMin}m ${duracionSeg}s
<b>Tamaño:</b> ${tamanoMB} MB

🎯 Listo para publicar`;

  await enviarMensajeTelegram(mensaje);
}

module.exports = {
  isTelegramEnabled,
  enviarMensajeTelegram,
  notificarPublicacionExitosa,
  notificarError,
  notificarInfo,
  notificarInicioVideoLargo,
  notificarVideoLargoCompletado
};
