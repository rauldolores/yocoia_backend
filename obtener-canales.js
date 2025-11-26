/**
 * Script para obtener los IDs y nombres de todos los canales
 * Ejecutar con: node obtener-canales.js
 */

require('dotenv').config();
const { supabase } = require('./src/config');

async function obtenerCanales() {
  console.log('\n📋 Consultando canales disponibles...\n');
  
  try {
    const { data: canales, error } = await supabase
      .from('canales')
      .select('id, nombre')
      .order('nombre', { ascending: true });

    if (error) {
      console.error('❌ Error al consultar canales:', error.message);
      return;
    }

    if (!canales || canales.length === 0) {
      console.log('⚠️  No se encontraron canales en la base de datos');
      return;
    }

    console.log(`✅ Se encontraron ${canales.length} canales:\n`);
    console.log('─'.repeat(80));
    
    canales.forEach((canal, index) => {
      console.log(`${index + 1}. ${canal.nombre}`);
      console.log(`   ID: ${canal.id}`);
      console.log('');
    });
    
    console.log('─'.repeat(80));
    console.log('\n📝 Para filtrar por estos canales, edita src/config/channel-filter.json\n');
    
    // Mostrar ejemplo de configuración
    console.log('Ejemplo usando IDs:');
    console.log(JSON.stringify({
      enabled: true,
      channels: {
        ids: canales.slice(0, 2).map(c => c.id),
        names: []
      }
    }, null, 2));
    
    console.log('\nEjemplo usando nombres:');
    console.log(JSON.stringify({
      enabled: true,
      channels: {
        ids: [],
        names: canales.slice(0, 2).map(c => c.nombre)
      }
    }, null, 2));
    
  } catch (error) {
    console.error('❌ Error inesperado:', error.message);
  }
}

obtenerCanales();
