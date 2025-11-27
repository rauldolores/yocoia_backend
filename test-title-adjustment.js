// Test de ajuste de títulos con hashtags y truncado

function ajustarTitulo(titulo) {
  const MAX_TITULO_LENGTH = 100;
  let tituloFinal = titulo;
  
  console.log(`\n📝 Original (${titulo.length} chars): "${titulo}"`);
  
  if (tituloFinal.length > MAX_TITULO_LENGTH) {
    console.log(`   ⚠️  Muy largo, ajustando...`);
    
    // Extraer hashtags
    const hashtagRegex = /#\w+/g;
    const hashtags = tituloFinal.match(hashtagRegex) || [];
    console.log(`   📌 Hashtags encontrados: ${hashtags.join(', ')}`);
    
    // Quitar hashtags del final uno por uno
    let tituloAjustado = tituloFinal;
    for (let i = hashtags.length - 1; i >= 0 && tituloAjustado.length > MAX_TITULO_LENGTH; i--) {
      const hashtagAQuitar = hashtags[i];
      tituloAjustado = tituloAjustado.replace(hashtagAQuitar, '').replace(/\s+/g, ' ').trim();
      console.log(`   🗑️  Quitando: ${hashtagAQuitar} → ${tituloAjustado.length} chars`);
    }
    
    // Si aún es largo, truncar
    if (tituloAjustado.length > MAX_TITULO_LENGTH) {
      console.log(`   ✂️  Truncando de ${tituloAjustado.length} a ${MAX_TITULO_LENGTH}`);
      tituloFinal = tituloAjustado.substring(0, MAX_TITULO_LENGTH).trim();
    } else {
      tituloFinal = tituloAjustado;
    }
    
    console.log(`   ✅ Ajustado (${tituloFinal.length} chars): "${tituloFinal}"`);
  } else {
    console.log(`   ✅ OK, no requiere ajuste`);
  }
  
  return tituloFinal;
}

// Tests
console.log('='.repeat(80));
console.log('TEST DE AJUSTE DE TÍTULOS');
console.log('='.repeat(80));

// Test 1: Título corto (no requiere ajuste)
ajustarTitulo('Este es un título corto #Test');

// Test 2: Título largo con varios hashtags
ajustarTitulo('Este es un título muy largo que definitivamente necesita ser ajustado porque tiene más de 100 caracteres #Historia #Datos #Curiosidades #Viral #Mexico');

// Test 3: Título largo con un solo hashtag
ajustarTitulo('Este es un título muy largo que necesita ser truncado porque incluso después de quitar hashtags sigue siendo demasiado largo para la plataforma #Hashtag');

// Test 4: Título largo sin hashtags
ajustarTitulo('Este es un título extremadamente largo que no tiene ningún hashtag y por lo tanto necesitará ser truncado directamente sin ningún paso intermedio de eliminación');

// Test 5: Título con hashtags en medio y al final
ajustarTitulo('Descubre #HistoriaMexicana estas increíbles monedas antiguas que valen miles #Coleccionismo #Numismatica #Tesoros');

console.log('\n' + '='.repeat(80));
console.log('✅ Tests completados');
console.log('='.repeat(80));
