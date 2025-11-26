/**
 * Utilidades de fecha y hora en timezone México
 */

const { TIMEZONE } = require('../config');

/**
 * Obtener fecha/hora actual en timezone de México
 * @returns {Date}
 */
function obtenerFechaMexico() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
}

/**
 * Convertir fecha a timezone de México
 * @param {Date} fecha
 * @returns {Date}
 */
function convertirAMexico(fecha) {
  return new Date(fecha.toLocaleString('en-US', { timeZone: TIMEZONE }));
}

/**
 * Obtener timestamp ISO en timezone de México
 * @returns {string}
 */
function obtenerTimestampMexico() {
  const fechaMX = obtenerFechaMexico();
  return fechaMX.toISOString();
}

/**
 * Generar desface aleatorio de minutos
 * @returns {number}
 */
function generarDesfaceAleatorio() {
  const { MINUTOS_DESFACE_MIN, MINUTOS_DESFACE_MAX } = require('../config');
  return Math.floor(Math.random() * (MINUTOS_DESFACE_MAX - MINUTOS_DESFACE_MIN + 1)) + MINUTOS_DESFACE_MIN;
}

module.exports = {
  obtenerFechaMexico,
  convertirAMexico,
  obtenerTimestampMexico,
  generarDesfaceAleatorio
};
