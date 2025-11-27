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
const { CRON_CONFIG, CHANNEL_FILTER, HORAS_PUBLICACION, MINUTOS_DESFACE_MIN, MINUTOS_DESFACE_MAX, TIMEZONE, supabase } = require('./config');
const {
  procesarVideos,
  programarPublicaciones,
  publicarEnRedesSociales,
  generarGuionesDesdeIdeas
} = require('./jobs');

/**
 * Mostrar configuración de ventanas de programación
 */
function mostrarConfiguracionProgramacion() {
  console.log('\n' + '='.repeat(80));
  console.log('⏰ CONFIGURACIÓN DE VENTANAS DE PROGRAMACIÓN');
  console.log('='.repeat(80));
  
  console.log(`🌍 Zona horaria: ${TIMEZONE}`);
  console.log(`📅 Horas de publicación: ${HORAS_PUBLICACION.join(', ')}`);
  console.log(`🎲 Desface aleatorio: ${MINUTOS_DESFACE_MIN}-${MINUTOS_DESFACE_MAX} minutos`);
  
  console.log('\n📋 Ventanas de publicación:');
  HORAS_PUBLICACION.forEach(hora => {
    const horaFormatted = hora.toString().padStart(2, '0');
    const minutoMin = MINUTOS_DESFACE_MIN.toString().padStart(2, '0');
    const minutoMax = MINUTOS_DESFACE_MAX.toString().padStart(2, '0');
    console.log(`   • ${horaFormatted}:${minutoMin} - ${horaFormatted}:${minutoMax}`);
  });
  
  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Mostrar información de canales que se están procesando
 */
async function mostrarCanalesProcesados() {
  console.log('\n' + '='.repeat(80));
  console.log('📺 CONFIGURACIÓN DE CANALES');
  console.log('='.repeat(80));
  
  if (!CHANNEL_FILTER.enabled) {
    console.log('✅ Procesando TODOS los canales disponibles\n');
    return;
  }
  
  console.log('🔍 Filtro de canales ACTIVO:\n');
  
  if (CHANNEL_FILTER.channels.ids.length > 0) {
    console.log('   📋 Por IDs:');
    CHANNEL_FILTER.channels.ids.forEach(id => console.log(`      - ${id}`));
    console.log('');
  }
  
  if (CHANNEL_FILTER.channels.names.length > 0) {
    console.log('   📝 Por nombres:');
    CHANNEL_FILTER.channels.names.forEach(name => console.log(`      - ${name}`));
    console.log('');
  }
  
  // Intentar obtener información detallada de los canales
  try {
    let query = supabase.from('canales').select('id, nombre');
    
    if (CHANNEL_FILTER.channels.ids.length > 0) {
      query = query.in('id', CHANNEL_FILTER.channels.ids);
    }
    
    const { data: canales, error } = await query;
    
    if (!error && canales && canales.length > 0) {
      // Filtrar por nombres si es necesario
      let canalesFiltrados = canales;
      if (CHANNEL_FILTER.channels.names.length > 0) {
        canalesFiltrados = canales.filter(c => CHANNEL_FILTER.channels.names.includes(c.nombre));
      }
      
      if (canalesFiltrados.length > 0) {
        console.log('   ✅ Canales encontrados:');
        canalesFiltrados.forEach(canal => {
          console.log(`      • ${canal.nombre} (${canal.id})`);
        });
        console.log('');
      }
    }
  } catch (error) {
    console.warn('   ⚠️  No se pudo consultar la base de datos de canales');
  }
  
  console.log('='.repeat(80) + '\n');
}

/**
 * Configurar tareas programadas con cron
 */
function iniciarCron() {
  console.log('🚀 Iniciando servicios automatizados...');
  console.log('⌨️  Presiona Ctrl+C para detener los servicios\n');

  let cronCount = 0;

  // Cron 1: Generación de videos
  if (CRON_CONFIG.videoGeneration.enabled) {
    const minutes = CRON_CONFIG.videoGeneration.minutes;
    cron.schedule(`*/${minutes} * * * *`, () => {
      procesarVideos();
    });
    console.log(`✅ Cron job ${++cronCount}: Generación de videos (cada ${minutes} minutos)`);
  } else {
    console.log('⏸️  Cron job: Generación de videos (DESHABILITADO)');
  }

  // Cron 2: Programación de publicaciones
  if (CRON_CONFIG.publicationScheduling.enabled) {
    const minutes = CRON_CONFIG.publicationScheduling.minutes;
    cron.schedule(`*/${minutes} * * * *`, () => {
      programarPublicaciones();
    });
    console.log(`✅ Cron job ${++cronCount}: Programación de publicaciones (cada ${minutes} minutos)`);
  } else {
    console.log('⏸️  Cron job: Programación de publicaciones (DESHABILITADO)');
  }

  // Cron 3: Publicación en redes sociales
  if (CRON_CONFIG.socialPublishing.enabled) {
    const minutes = CRON_CONFIG.socialPublishing.minutes;
    cron.schedule(`*/${minutes} * * * *`, () => {
      publicarEnRedesSociales();
    });
    console.log(`✅ Cron job ${++cronCount}: Publicación en redes sociales (cada ${minutes} minutos)`);
  } else {
    console.log('⏸️  Cron job: Publicación en redes sociales (DESHABILITADO)');
  }

  // Cron 4: Generación de guiones desde ideas
  if (CRON_CONFIG.scriptGeneration.enabled) {
    const minutes = CRON_CONFIG.scriptGeneration.minutes;
    cron.schedule(`*/${minutes} * * * *`, () => {
      generarGuionesDesdeIdeas();
    });
    console.log(`✅ Cron job ${++cronCount}: Generación de guiones desde ideas (cada ${minutes} minutos)`);
  } else {
    console.log('⏸️  Cron job: Generación de guiones desde ideas (DESHABILITADO)');
  }
  
  if (cronCount === 0) {
    console.log('\n⚠️  ADVERTENCIA: Todos los cron jobs están deshabilitados');
    console.log('   Configura las variables CRON_*_ENABLED=true en .env para activarlos\n');
  } else {
    console.log(`\n✅ ${cronCount} cron job(s) activo(s)`);
    console.log('⏳ Esperando próximas ejecuciones...\n');
  }
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
  // Mostrar configuración de programación
  mostrarConfiguracionProgramacion();
  
  // Mostrar información de canales procesados
  await mostrarCanalesProcesados();
  
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
