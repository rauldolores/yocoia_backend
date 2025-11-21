/**
 * Script auxiliar para obtener Refresh Tokens de YouTube
 * Ejecuta este script una vez por cada canal de YouTube que quieras agregar
 * 
 * USO:
 * 1. Asegúrate de tener YOUTUBE_CLIENT_ID y YOUTUBE_CLIENT_SECRET en .env
 * 2. Ejecuta: node obtener-youtube-token.js
 * 3. Copia la URL que aparece y ábrela en el navegador
 * 4. Autoriza el acceso con la cuenta del canal de YouTube
 * 5. Copia el código de la URL de redirección
 * 6. Pégalo cuando el script te lo pida
 * 7. Guarda el refresh_token en tu base de datos (tabla canales)
 */

require('dotenv').config();
const readline = require('readline');

// Validar variables de entorno
if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
  console.error('❌ ERROR: Faltan variables de entorno');
  console.error('   Asegúrate de tener YOUTUBE_CLIENT_ID y YOUTUBE_CLIENT_SECRET en .env');
  process.exit(1);
}

const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

// Validar formato de credenciales
if (!YOUTUBE_CLIENT_ID.includes('.apps.googleusercontent.com')) {
  console.error('❌ ERROR: YOUTUBE_CLIENT_ID no parece válido');
  console.error('   Debe terminar en .apps.googleusercontent.com');
  console.error('   Ejemplo: 123456789012-abc...xyz.apps.googleusercontent.com');
  process.exit(1);
}

if (!YOUTUBE_CLIENT_SECRET.startsWith('GOCSPX-')) {
  console.error('⚠️  ADVERTENCIA: YOUTUBE_CLIENT_SECRET no parece válido');
  console.error('   Normalmente empieza con "GOCSPX-"');
  console.error('   Verifica que lo hayas copiado correctamente\n');
}

// Crear interfaz para leer entrada del usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function pregunta(texto) {
  return new Promise((resolve) => {
    rl.question(texto, (respuesta) => {
      resolve(respuesta.trim());
    });
  });
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🎥 OBTENER REFRESH TOKEN DE YOUTUBE');
  console.log('='.repeat(80) + '\n');

  console.log('📋 Configuración actual:');
  console.log(`   Client ID: ${YOUTUBE_CLIENT_ID.substring(0, 20)}...`);
  console.log(`   Client Secret: ${YOUTUBE_CLIENT_SECRET.substring(0, 10)}...`);
  console.log(`   Redirect URI: ${REDIRECT_URI}`);
  console.log('');
  console.log('⚠️  IMPORTANTE: Verifica que esta Redirect URI esté EXACTAMENTE igual');
  console.log('   en Google Cloud Console → Credenciales → Tu cliente OAuth');
  console.log('   (debe ser http://localhost:3000/oauth2callback)\n');

  try {
    // Importar googleapis
    let google;
    try {
      const googleapis = require('googleapis');
      google = googleapis.google;
    } catch (error) {
      console.error('❌ ERROR: No se encontró el paquete googleapis');
      console.error('   Ejecuta: npm install googleapis');
      process.exit(1);
    }

    // Crear cliente OAuth2
    const oauth2Client = new google.auth.OAuth2(
      YOUTUBE_CLIENT_ID,
      YOUTUBE_CLIENT_SECRET,
      REDIRECT_URI
    );

    // Generar URL de autorización
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent' // Fuerza a mostrar la pantalla de consentimiento para obtener refresh_token
    });

    console.log('🔗 PASO 1: Abre esta URL en tu navegador:\n');
    console.log(authUrl);
    console.log('\n' + '-'.repeat(80) + '\n');

    console.log('📝 PASO 2: Autoriza el acceso con la cuenta del canal de YouTube\n');
    console.log('📝 PASO 3: Serás redirigido a una URL que empieza con:');
    console.log(`   ${REDIRECT_URI}?code=...\n`);
    console.log('   (Si ves un error de "sitio no disponible", está bien, solo copia la URL)\n');

    const code = await pregunta('📝 PASO 4: Pega el CÓDIGO de la URL (la parte después de "?code="): ');

    if (!code) {
      console.error('\n❌ No se proporcionó ningún código');
      process.exit(1);
    }

    console.log('\n⏳ Intercambiando código por tokens...\n');

    // Intercambiar código por tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      console.error('\n❌ ERROR: No se obtuvo refresh_token');
      console.error('   Esto puede pasar si ya autorizaste esta app antes.');
      console.error('   Solución: Revoca el acceso en https://myaccount.google.com/permissions');
      console.error('   Y vuelve a ejecutar este script.');
      process.exit(1);
    }

    // Probar el token obteniendo info del canal
    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube('v3');
    
    console.log('✅ Tokens obtenidos correctamente\n');
    console.log('🔍 Verificando acceso al canal...\n');

    const channelResponse = await youtube.channels.list({
      auth: oauth2Client,
      part: 'snippet,contentDetails,statistics',
      mine: true
    });

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      console.error('❌ ERROR: No se encontró ningún canal asociado a esta cuenta');
      process.exit(1);
    }

    const channel = channelResponse.data.items[0];

    console.log('✅ Canal verificado:\n');
    console.log(`   📺 Nombre: ${channel.snippet.title}`);
    console.log(`   🆔 ID: ${channel.id}`);
    console.log(`   👥 Suscriptores: ${channel.statistics.subscriberCount}`);
    console.log(`   🎬 Videos: ${channel.statistics.videoCount}`);
    console.log(`   👁️  Vistas: ${channel.statistics.viewCount}\n`);

    console.log('='.repeat(80));
    console.log('✅ REFRESH TOKEN OBTENIDO');
    console.log('='.repeat(80) + '\n');

    console.log('🔑 REFRESH TOKEN (guárdalo en tu base de datos):\n');
    console.log(tokens.refresh_token);
    console.log('\n' + '-'.repeat(80) + '\n');

    console.log('📋 SQL para insertar/actualizar el canal:\n');
    console.log(`INSERT INTO canales (nombre, plataforma, credenciales)`);
    console.log(`VALUES (`);
    console.log(`  '${channel.snippet.title}',`);
    console.log(`  'youtube',`);
    console.log(`  '{"youtube": {"refresh_token": "${tokens.refresh_token}"}}'::jsonb`);
    console.log(`);\n`);

    console.log('-- O si ya existe el canal, actualiza solo las credenciales:\n');
    console.log(`UPDATE canales`);
    console.log(`SET credenciales = jsonb_set(`);
    console.log(`  COALESCE(credenciales, '{}'::jsonb),`);
    console.log(`  '{youtube}',`);
    console.log(`  '{"refresh_token": "${tokens.refresh_token}"}'::jsonb`);
    console.log(`)`);
    console.log(`WHERE nombre = '${channel.snippet.title}' AND plataforma = 'youtube';\n`);

    console.log('='.repeat(80));
    console.log('✅ ¡LISTO! Ya puedes usar este token para publicar videos');
    console.log('='.repeat(80) + '\n');

    console.log('💡 NOTAS IMPORTANTES:\n');
    console.log('   • Este refresh_token NO expira (a menos que revoques el acceso)');
    console.log('   • Guárdalo de forma segura en tu base de datos');
    console.log('   • Puedes repetir este proceso para cada canal que quieras agregar');
    console.log('   • Todos los canales pueden usar el mismo CLIENT_ID y CLIENT_SECRET\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response) {
      console.error('   Respuesta de la API:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Ejecutar script
main();
