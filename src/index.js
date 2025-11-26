/**
 * Punto de Entrada Principal - Sistema de Generación y Publicación de Videos
 * 
 * Este módulo inicializa todos los servicios automatizados del sistema:
 * 1. Generación de videos desde guiones
 * 2. Programación de publicaciones
 * 3. Publicación en YouTube y Facebook
 * 4. Generación de guiones desde ideas
 */

const cron = require('node-cron');
const { limpiarTemp } = require('./utils/file');
const {
  procesarVideos,
  programarPublicaciones,
  publicarEnRedesSociales,
  generarGuionesDesdeIdeas
} = require('./jobs');

/**
 * Configurar tareas programadas con cron
 */
function iniciarCron() {
  console.log('🚀 Iniciando servicios automatizados...');
  console.log('⌨️  Presiona Ctrl+C para detener los servicios\n');

  // Cron 1: Generación de videos - cada 10 minutos
  cron.schedule('*/10 * * * *', () => {
    procesarVideos();
  });
  console.log('✅ Cron job 1: Generación de videos (cada 10 minutos)');

  // Cron 2: Programación de publicaciones - cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    programarPublicaciones();
  });
  console.log('✅ Cron job 2: Programación de publicaciones (cada 5 minutos)');

  // Cron 3: Publicación en redes sociales - cada 2 minutos
  cron.schedule('*/2 * * * *', () => {
    publicarEnRedesSociales();
  });
  console.log('✅ Cron job 3: Publicación en redes sociales (cada 2 minutos)');

  // Cron 4: Generación de guiones desde ideas - cada 7 minutos
  cron.schedule('*/7 * * * *', () => {
    generarGuionesDesdeIdeas();
  });
  console.log('✅ Cron job 4: Generación de guiones desde ideas (cada 7 minutos)');
  console.log('\n⏳ Esperando próximas ejecuciones...\n');
}

/**
 * Ejecutar procesos iniciales (opcional)
 */
async function ejecutarProcesosIniciales() {
  console.log('🔄 Ejecutando procesos iniciales...\n');

  try {
    // Ejecutar generación de videos
    await procesarVideos();
    console.log('');
    
    // Después de procesar videos, ejecutar programación
    await programarPublicaciones();
  } catch (error) {
    console.error('Error en procesos iniciales:', error);
  }
}

/**
 * Función principal
 */
async function main() {
  // Ejecutar procesos iniciales (comentar esta línea para omitir ejecución inicial)
  await ejecutarProcesosIniciales();

  // Iniciar los cron jobs
  iniciarCron();

  // Mantener el proceso vivo y manejar cierre graceful
  process.on('SIGINT', () => {
    console.log('\n\n👋 Deteniendo servicio de generación de videos...');
    limpiarTemp();
    console.log('✅ Servicio detenido correctamente');
    process.exit(0);
  });
}

// Ejecutar si es el módulo principal
if (require.main === module) {
  main();
}

// Exportar para uso como módulo
module.exports = {
  iniciarCron,
  ejecutarProcesosIniciales,
  main
};
