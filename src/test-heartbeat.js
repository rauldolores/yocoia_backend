/**
 * Script de prueba para el sistema de heartbeat
 * 
 * Ejecutar con: node src/test-heartbeat.js
 */

const { iniciarHeartbeat, detenerHeartbeat, EstadoConsola, cambiarEstado, obtenerConsoleId } = require('./services/heartbeat');

async function probarHeartbeat() {
  console.log('\n🧪 === PRUEBA DE SISTEMA DE HEARTBEAT ===\n');
  
  // Mostrar Console ID
  const consoleId = obtenerConsoleId();
  console.log(`📋 Console ID: ${consoleId}\n`);
  
  // Iniciar heartbeat (cada 1 minuto para pruebas)
  console.log('🚀 Iniciando servicio de heartbeat...\n');
  const intervalId = await iniciarHeartbeat(1);
  
  if (!intervalId) {
    console.log('⚠️  Heartbeat no se pudo iniciar (API_BASE_URL no configurado)');
    console.log('   Configura API_BASE_URL en .env para habilitar el heartbeat\n');
    return;
  }
  
  // Simular cambios de estado
  console.log('🔄 Simulando cambios de estado...\n');
  
  setTimeout(() => {
    console.log('▶️  Cambiando a OCUPADA...');
    cambiarEstado(EstadoConsola.OCUPADA, { 
      videoEnProceso: 'Video de Prueba 1' 
    });
  }, 5000);
  
  setTimeout(() => {
    console.log('▶️  Cambiando a ACTIVA...');
    cambiarEstado(EstadoConsola.ACTIVA);
  }, 10000);
  
  setTimeout(() => {
    console.log('▶️  Simulando ERROR...');
    cambiarEstado(EstadoConsola.ERROR, { 
      error: new Error('Error de prueba simulado') 
    });
  }, 15000);
  
  setTimeout(() => {
    console.log('▶️  Cambiando a ESPERANDO...');
    cambiarEstado(EstadoConsola.ESPERANDO);
  }, 20000);
  
  setTimeout(() => {
    console.log('\n🛑 Deteniendo servicio de heartbeat...');
    detenerHeartbeat(intervalId);
    console.log('✅ Prueba completada\n');
    process.exit(0);
  }, 25000);
  
  console.log('⏳ Ejecutando prueba durante 25 segundos...');
  console.log('   Presiona Ctrl+C para cancelar\n');
}

// Manejar Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Cancelando prueba...');
  process.exit(0);
});

// Ejecutar prueba
probarHeartbeat().catch(error => {
  console.error('❌ Error en la prueba:', error);
  process.exit(1);
});
