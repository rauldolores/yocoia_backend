/**
 * Script de prueba para el validador de ideas
 * 
 * Ejecutar con: node src/test-ideas-validator.js
 */

require('dotenv').config();
const { validarYGenerarIdeas } = require('./jobs/ideas-validator');

console.log('🧪 Iniciando prueba del validador de ideas...\n');

// Verificar configuración
console.log('📋 Configuración:');
console.log(`   API_BASE_URL: ${process.env.API_BASE_URL || '❌ NO CONFIGURADO'}`);
console.log(`   CRON_IDEAS_VALIDATION_ENABLED: ${process.env.CRON_IDEAS_VALIDATION_ENABLED}`);
console.log(`   CRON_IDEAS_VALIDATION_MINUTES: ${process.env.CRON_IDEAS_VALIDATION_MINUTES}`);
console.log('');

// Ejecutar proceso
validarYGenerarIdeas()
  .then(() => {
    console.log('✅ Prueba completada exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error en la prueba:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
