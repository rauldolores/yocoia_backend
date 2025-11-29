// Test de consulta de horas programadas
require('dotenv').config();
const { supabase } = require('./src/config');

async function testConsultaHorasProgramadas() {
  console.log('='.repeat(80));
  console.log('TEST: Consulta de Horas Programadas por Canal');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Obtener un canal de prueba
    console.log('1️⃣  Obteniendo canal de prueba...');
    const { data: canales, error: errorCanales } = await supabase
      .from('canales')
      .select('id, nombre')
      .limit(1);

    if (errorCanales || !canales || canales.length === 0) {
      console.log('❌ No se encontraron canales');
      return;
    }

    const canal = canales[0];
    console.log(`   ✅ Canal: ${canal.nombre} (${canal.id})`);
    console.log('');

    // Test de la consulta con la FK corregida
    console.log('2️⃣  Probando consulta con FK corregida (fk_videos_guion)...');
    
    const ahora = new Date();
    const inicioDelDia = new Date(ahora);
    inicioDelDia.setHours(0, 0, 0, 0);
    
    const finDelDia = new Date(ahora);
    finDelDia.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('videos')
      .select(`
        id,
        titulo,
        publicacion_programada_at,
        guiones!fk_videos_guion (
          canal_id,
          canales (nombre)
        )
      `)
      .eq('guiones.canal_id', canal.id)
      .gte('publicacion_programada_at', inicioDelDia.toISOString())
      .lte('publicacion_programada_at', finDelDia.toISOString())
      .not('publicacion_programada_at', 'is', null);

    if (error) {
      console.log('   ❌ ERROR en consulta:', error.message);
      console.log('   Detalles:', JSON.stringify(error, null, 2));
      return;
    }

    console.log(`   ✅ Consulta exitosa!`);
    console.log(`   📊 Videos encontrados hoy: ${data.length}`);
    console.log('');

    if (data.length > 0) {
      console.log('3️⃣  Videos programados para hoy:');
      data.forEach((video, index) => {
        const fecha = new Date(video.publicacion_programada_at);
        const hora = fecha.getHours();
        const minutos = fecha.getMinutes().toString().padStart(2, '0');
        console.log(`   [${index + 1}] ${hora}:${minutos} - ${video.titulo.substring(0, 50)}...`);
      });
    } else {
      console.log('3️⃣  No hay videos programados para hoy en este canal');
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ TEST COMPLETADO EXITOSAMENTE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('');
    console.error('❌ ERROR GENERAL:', error.message);
    console.error(error);
  }
}

testConsultaHorasProgramadas();
