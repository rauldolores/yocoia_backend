/**
 * Servicio de Heartbeat - Reportar Actividad de la Consola
 * 
 * Este módulo se encarga de:
 * 1. Registrar la consola en el sistema (primera vez)
 * 2. Enviar heartbeats periódicos para reportar estado
 * 3. Actualizar el estado de la consola (activa, ocupada, esperando, error)
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Ruta para almacenar el ID de consola generado
const CONSOLE_ID_FILE = path.join(__dirname, '../../..', '.console-id');

/**
 * Estado de la consola
 */
const EstadoConsola = {
  ACTIVA: 'activa',           // Funcionando normalmente
  OCUPADA: 'ocupada',         // Procesando video actualmente
  ESPERANDO: 'esperando',     // Sin trabajo, esperando nuevos videos
  ERROR: 'error'              // Tiene errores pero sigue funcionando
};

/**
 * Estado actual de la consola (singleton)
 */
let estadoActual = EstadoConsola.ESPERANDO;
let ultimoError = null;
let videoEnProceso = null;

/**
 * Obtener o generar ID de consola
 * @returns {string} - ID único de la consola
 */
function obtenerConsoleId() {
  // Primero intentar desde variable de entorno
  if (process.env.CONSOLE_ID && process.env.CONSOLE_ID.trim()) {
    return process.env.CONSOLE_ID.trim();
  }

  // Si no existe, intentar leer desde archivo
  if (fs.existsSync(CONSOLE_ID_FILE)) {
    try {
      const id = fs.readFileSync(CONSOLE_ID_FILE, 'utf-8').trim();
      if (id) {
        console.log(`📋 Console ID cargado desde archivo: ${id}`);
        return id;
      }
    } catch (error) {
      console.warn('⚠️  Error al leer Console ID desde archivo:', error.message);
    }
  }

  // Si no existe, generar nuevo ID y guardarlo
  const nuevoId = uuidv4();
  try {
    fs.writeFileSync(CONSOLE_ID_FILE, nuevoId, 'utf-8');
    console.log(`✨ Nuevo Console ID generado y guardado: ${nuevoId}`);
  } catch (error) {
    console.warn('⚠️  No se pudo guardar Console ID en archivo:', error.message);
  }

  return nuevoId;
}

/**
 * Obtener información del sistema
 * @returns {Object}
 */
function obtenerInfoSistema() {
  const os = require('os');
  
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024), // GB
    freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024), // GB
    uptime: Math.round(os.uptime() / 60), // minutos
    nodeVersion: process.version
  };
}

/**
 * Registrar consola en el sistema (primera vez)
 * @param {string} consoleId - ID de la consola
 * @param {string} apiBaseUrl - URL base del API
 * @returns {Promise<boolean>} - true si se registró correctamente
 */
async function registrarConsola(consoleId, apiBaseUrl) {
  try {
    const infoSistema = obtenerInfoSistema();
    
    const payload = {
      id: consoleId,
      nombre: `Consola ${infoSistema.hostname}`,
      estado: EstadoConsola.ESPERANDO,
      sistema: infoSistema,
      ultimaActividad: new Date().toISOString()
    };

    const url = `${apiBaseUrl}/consolas/registrar`;
    console.log(`📡 Registrando consola en: ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        url: url,
        method: 'POST',
        body: errorText || '(sin contenido)'
      };
      
      console.error('❌ Error al registrar consola:');
      console.error(`   Status: ${errorDetails.status} ${errorDetails.statusText}`);
      console.error(`   URL: ${errorDetails.url}`);
      console.error(`   Respuesta: ${errorDetails.body}`);
      
      if (response.status === 405) {
        console.error('   ℹ️  HTTP 405 = Method Not Allowed');
        console.error('   ℹ️  El endpoint existe pero no acepta el método POST');
        console.error('   ℹ️  Verifica la implementación del endpoint en el servidor');
      }
      
      return false;
    }

    const result = await response.json();
    console.log('✅ Consola registrada exitosamente');
    return true;

  } catch (error) {
    console.error('❌ Error al registrar consola:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   ℹ️  No se pudo conectar al servidor. ¿Está ejecutándose?');
    }
    return false;
  }
}

/**
 * Enviar heartbeat al servidor
 * @param {string} consoleId - ID de la consola
 * @param {string} apiBaseUrl - URL base del API
 * @returns {Promise<boolean>} - true si se envió correctamente
 */
async function enviarHeartbeat(consoleId, apiBaseUrl) {
  try {
    const infoSistema = obtenerInfoSistema();
    
    const payload = {
      estado: estadoActual,
      sistema: infoSistema,
      ultimaActividad: new Date().toISOString(),
      ultimoError: ultimoError,
      videoEnProceso: videoEnProceso
    };

    const url = `${apiBaseUrl}/consolas/${consoleId}/heartbeat`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        url: url,
        method: 'POST',
        body: errorText || '(sin contenido)'
      };
      
      console.error('❌ Error al enviar heartbeat:');
      console.error(`   Status: ${errorDetails.status} ${errorDetails.statusText}`);
      console.error(`   URL: ${errorDetails.url}`);
      console.error(`   Respuesta: ${errorDetails.body}`);
      
      if (response.status === 405) {
        console.error('   ℹ️  HTTP 405 = Method Not Allowed');
        console.error('   ℹ️  El endpoint existe pero no acepta el método POST');
      }
      
      return false;
    }

    const result = await response.json();
    
    // Log silencioso para heartbeats normales
    if (estadoActual !== EstadoConsola.ESPERANDO) {
      console.log(`💓 Heartbeat enviado - Estado: ${estadoActual}`, videoEnProceso ? `(${videoEnProceso})` : '');
    }
    
    return true;

  } catch (error) {
    console.error('❌ Error al enviar heartbeat:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   ℹ️  No se pudo conectar al servidor');
    }
    return false;
  }
}

/**
 * Cambiar estado de la consola
 * @param {string} nuevoEstado - Nuevo estado (usar EstadoConsola)
 * @param {Object} opciones - Opciones adicionales (videoEnProceso, error)
 */
function cambiarEstado(nuevoEstado, opciones = {}) {
  const estadoAnterior = estadoActual;
  estadoActual = nuevoEstado;
  
  if (opciones.videoEnProceso) {
    videoEnProceso = opciones.videoEnProceso;
  } else if (nuevoEstado !== EstadoConsola.OCUPADA) {
    videoEnProceso = null;
  }
  
  if (opciones.error) {
    ultimoError = {
      mensaje: opciones.error.message || opciones.error.toString(),
      timestamp: new Date().toISOString()
    };
  } else if (nuevoEstado !== EstadoConsola.ERROR) {
    ultimoError = null;
  }
  
  // Log solo cuando cambia de estado
  if (estadoAnterior !== nuevoEstado) {
    console.log(`🔄 Estado de consola: ${estadoAnterior} → ${nuevoEstado}`);
  }
}

/**
 * Iniciar servicio de heartbeat
 * @param {number} intervalMinutos - Intervalo en minutos entre heartbeats
 */
async function iniciarHeartbeat(intervalMinutos = 5) {
  const apiBaseUrl = process.env.API_BASE_URL;
  
  if (!apiBaseUrl) {
    console.warn('⚠️  API_BASE_URL no configurado, heartbeat deshabilitado');
    return null;
  }

  const consoleId = obtenerConsoleId();
  
  console.log('\n' + '='.repeat(80));
  console.log('💓 SERVICIO DE HEARTBEAT');
  console.log('='.repeat(80));
  console.log(`📋 Console ID: ${consoleId}`);
  console.log(`🌐 API Base URL: ${apiBaseUrl}`);
  console.log(`⏱️  Intervalo: cada ${intervalMinutos} minuto(s)`);
  console.log('='.repeat(80) + '\n');

  // Registrar consola al inicio
  const registroExitoso = await registrarConsola(consoleId, apiBaseUrl);
  
  if (!registroExitoso) {
    console.warn('\n⚠️  No se pudo registrar la consola en el servidor');
    console.warn('   El heartbeat continuará intentando enviar reportes periódicos');
    console.warn('   Si el error persiste, puedes deshabilitar el heartbeat comentando');
    console.warn('   la variable API_BASE_URL en el archivo .env\n');
  }

  // Enviar heartbeat inmediatamente (solo si el registro fue exitoso)
  if (registroExitoso) {
    await enviarHeartbeat(consoleId, apiBaseUrl);
  }

  // Configurar envío periódico
  const intervalMs = intervalMinutos * 60 * 1000;
  const intervalId = setInterval(async () => {
    await enviarHeartbeat(consoleId, apiBaseUrl);
  }, intervalMs);

  console.log('✅ Servicio de heartbeat iniciado\n');

  return intervalId;
}

/**
 * Detener servicio de heartbeat
 * @param {NodeJS.Timeout} intervalId - ID del intervalo retornado por iniciarHeartbeat
 */
function detenerHeartbeat(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    console.log('🛑 Servicio de heartbeat detenido');
  }
}

module.exports = {
  EstadoConsola,
  iniciarHeartbeat,
  detenerHeartbeat,
  cambiarEstado,
  obtenerConsoleId
};
