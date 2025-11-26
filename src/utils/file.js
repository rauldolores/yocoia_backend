/**
 * Utilidades generales del sistema
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const ffmpeg = require('fluent-ffmpeg');
const { TEMP_DIR, EXPORTS_DIR } = require('../config');

/**
 * Crear directorios si no existen
 */
function crearDirectorios() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`📁 Directorio temporal creado: ${TEMP_DIR}`);
  }
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    console.log(`📁 Directorio de exportación creado: ${EXPORTS_DIR}`);
  }
}

/**
 * Limpiar archivos temporales
 */
function limpiarTemp() {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      const archivos = fs.readdirSync(TEMP_DIR);
      archivos.forEach(archivo => {
        const rutaArchivo = `${TEMP_DIR}/${archivo}`;
        fs.unlinkSync(rutaArchivo);
      });
      console.log('🧹 Archivos temporales eliminados');
    }
  } catch (error) {
    console.error('⚠️  Error al limpiar archivos temporales:', error.message);
  }
}

/**
 * Descargar archivo desde URL
 * @param {string} url
 * @param {string} destino
 * @returns {Promise<string>}
 */
function descargarArchivo(url, destino) {
  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith('https') ? https : http;
    const archivo = fs.createWriteStream(destino);

    protocolo.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Error al descargar: código ${response.statusCode}`));
        return;
      }

      response.pipe(archivo);

      archivo.on('finish', () => {
        archivo.close();
        resolve(destino);
      });
    }).on('error', (error) => {
      fs.unlinkSync(destino);
      reject(error);
    });
  });
}

/**
 * Obtener duración de audio usando ffprobe
 * @param {string} rutaArchivo
 * @returns {Promise<number>}
 */
function obtenerDuracionAudio(rutaArchivo) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(rutaArchivo, (error, metadata) => {
      if (error) {
        reject(error);
        return;
      }
      const duracion = metadata.format.duration;
      resolve(duracion);
    });
  });
}

module.exports = {
  crearDirectorios,
  limpiarTemp,
  descargarArchivo,
  obtenerDuracionAudio
};
