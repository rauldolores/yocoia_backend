/**
 * Job: Publicador de Catálogos en Facebook
 * 
 * Ejecuta las publicaciones programadas de catálogos en páginas de Facebook
 * llamando al endpoint de la API de gestión.
 */

const fetch = require('node-fetch');
const { obtenerFechaMexico } = require('../utils/date');
const { reportarError, TipoError, Severidad } = require('../services/heartbeat');
const { notificarInfo, notificarError } = require('../services/telegram');

// Variables de entorno
const API_BASE_URL = process.env.API_BASE_URL;
const CRON_SECRET = process.env.CRON_SECRET;

// Lock para evitar ejecuciones concurrentes
let isPublishingCatalogos = false;

/**
 * Ejecutar publicaciones programadas de catálogos
 */
async function ejecutarPublicacionesCatalogos() {
  // Verificar si ya hay una ejecución en progreso
  if (isPublishingCatalogos) {
    console.log('\n⏸️  Publicación de catálogos ya en progreso, omitiendo esta ejecución...\n');
    return;
  }

  // Verificar configuración
  if (!API_BASE_URL) {
    console.error('❌ API_BASE_URL no está configurada en .env');
    return;
  }

  if (!CRON_SECRET) {
    console.warn('⚠️  CRON_SECRET no está configurado, la API podría rechazar la solicitud');
  }

  // Marcar como en progreso
  isPublishingCatalogos = true;

  try {
    console.log('\n' + '='.repeat(80));
    console.log('📚 INICIANDO PUBLICACIÓN DE CATÁLOGOS');
    console.log('⏰ Timestamp México:', obtenerFechaMexico().toLocaleString('es-MX'));
    console.log('='.repeat(80) + '\n');

    const url = `${API_BASE_URL}/catalogos/ejecutar-programaciones`;
    
    console.log(`🌐 Llamando a: ${url}`);

    // Preparar headers
    const headers = {
      'Content-Type': 'application/json'
    };

    // Agregar autorización si está configurado el secret
    if (CRON_SECRET) {
      headers['Authorization'] = `Bearer ${CRON_SECRET}`;
    }

    // Llamar al endpoint
    const response = await fetch(url, {
      method: 'POST',
      headers: headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const resultado = await response.json();

    console.log('\n📊 Resultado de la ejecución:');
    console.log(`   • Programaciones ejecutadas: ${resultado.ejecutadas || 0}`);
    console.log(`   • Exitosas: ${resultado.exitosas || 0}`);
    console.log(`   • Fallidas: ${resultado.fallidas || 0}`);
    console.log(`   • Timestamp: ${resultado.timestamp || 'N/A'}`);

    // Notificar si hubo publicaciones exitosas
    if (resultado.exitosas > 0) {
      await notificarInfo(
        `📚 <b>Catálogos Publicados</b>\n\n` +
        `✅ Publicaciones exitosas: <b>${resultado.exitosas}</b>\n` +
        `${resultado.fallidas > 0 ? `⚠️ Fallidas: ${resultado.fallidas}\n` : ''}` +
        `📅 ${obtenerFechaMexico().toLocaleString('es-MX')}`
      );
    }

    // Reportar errores si hubo fallidas
    if (resultado.fallidas > 0) {
      await reportarError({
        tipo: TipoError.PUBLISHING,
        severidad: Severidad.WARNING,
        mensaje: `${resultado.fallidas} publicaciones de catálogos fallaron`,
        contexto: resultado
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ PUBLICACIÓN DE CATÁLOGOS COMPLETADA');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Error ejecutando publicaciones de catálogos:', error.message);
    console.error('='.repeat(80) + '\n');

    // Reportar error
    await reportarError({
      tipo: TipoError.PUBLISHING,
      severidad: Severidad.ERROR,
      mensaje: 'Error al ejecutar publicaciones de catálogos',
      error: error,
      contexto: {
        api_url: API_BASE_URL,
        timestamp: obtenerFechaMexico().toISOString()
      }
    });

    // Notificar por Telegram
    await notificarError(
      'Error en Publicación de Catálogos',
      error.message,
      {
        api_url: API_BASE_URL,
        timestamp: obtenerFechaMexico().toLocaleString('es-MX')
      }
    );

  } finally {
    // Liberar lock
    isPublishingCatalogos = false;
  }
}

module.exports = {
  ejecutarPublicacionesCatalogos
};
