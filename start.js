#!/usr/bin/env node

/**
 * Script de Inicio - Sistema Refactorizado
 * 
 * Este script proporciona una interfaz simple para ejecutar
 * el sistema modular de generación y publicación de videos.
 */

// Importar el sistema modular
const { main } = require('./src');

// Ejecutar
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   Sistema de Generación y Publicación de Videos (Modular)   ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
