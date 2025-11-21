# Instrucciones para Implementar APIs de Redes Sociales

## ✅ Sistema de Publicación Implementado

El script ya tiene la estructura completa para publicar automáticamente en YouTube y Facebook. Solo necesitas completar las integraciones con las APIs.

### 📋 Estado Actual

- ✅ **Estructura completa** - Funciones y flujo de publicación
- ✅ **Consulta de videos** - Obtiene videos con estado `pendiente_publicar` y hora programada
- ✅ **Descarga de videos** - Desde Supabase Storage
- ✅ **Actualización en BD** - Guarda IDs externos y cambia estado
- ⚠️  **Publicación YouTube** - Pendiente de implementar
- ⚠️  **Publicación Facebook** - Pendiente de implementar

---

## 🎥 YouTube API - Implementación

### 1. Instalar Dependencias

```bash
npm install googleapis
```

### 2. Configurar OAuth 2.0 en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita **YouTube Data API v3**
4. Ve a **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth 2.0**
5. Tipo de aplicación: **Aplicación web**
6. URI de redirección autorizados: `http://localhost:3000/oauth2callback`
7. Copia el **Client ID** y **Client Secret**

### 3. Obtener Refresh Token

Necesitas un refresh token por cada canal de YouTube. Ejecuta este script una vez por canal:

```javascript
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  'TU_CLIENT_ID',
  'TU_CLIENT_SECRET',
  'http://localhost:3000/oauth2callback'
);

// Generar URL de autorización
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload']
});

console.log('Autoriza esta app visitando:', authUrl);

// Después de autorizar, intercambia el código por tokens
// oauth2Client.getToken('CODIGO_DE_AUTORIZACION', (err, tokens) => {
//   console.log('Refresh Token:', tokens.refresh_token);
// });
```

### 4. Guardar Tokens en la Tabla `canales`

Estructura del campo `credenciales` (jsonb):

```json
{
  "youtube": {
    "refresh_token": "1//tu-refresh-token-aqui",
    "client_id": "tu-client-id.apps.googleusercontent.com",
    "client_secret": "tu-client-secret"
  }
}
```

### 5. Implementar Función `publicarEnYouTube`

Reemplaza el código placeholder en `video-generator.js`:

```javascript
async function publicarEnYouTube(video, canal, rutaVideoLocal) {
  console.log('📺 Publicando en YouTube...');
  
  try {
    const { google } = require('googleapis');
    const youtube = google.youtube('v3');
    
    const credenciales = canal.credenciales?.youtube;
    if (!credenciales || !credenciales.refresh_token) {
      throw new Error('Canal no tiene credenciales de YouTube configuradas');
    }

    // Configurar OAuth2
    const oauth2Client = new google.auth.OAuth2(
      credenciales.client_id || YOUTUBE_CLIENT_ID,
      credenciales.client_secret || YOUTUBE_CLIENT_SECRET,
      YOUTUBE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: credenciales.refresh_token
    });

    // Subir video
    const fileSize = fs.statSync(rutaVideoLocal).size;
    
    const response = await youtube.videos.insert({
      auth: oauth2Client,
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: video.titulo,
          description: video.descripcion || '',
          categoryId: '22', // People & Blogs (ajustar según tu contenido)
          defaultLanguage: 'es',
          defaultAudioLanguage: 'es'
        },
        status: {
          privacyStatus: 'public', // 'public', 'private', 'unlisted'
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.createReadStream(rutaVideoLocal)
      }
    });

    const videoId = response.data.id;
    console.log(`✅ Video subido a YouTube: https://youtube.com/watch?v=${videoId}`);
    
    return videoId;
    
  } catch (error) {
    console.error('❌ Error al publicar en YouTube:', error.message);
    throw error;
  }
}
```

---

## 📘 Facebook API - Implementación

### 1. Configurar Facebook App

1. Ve a [Facebook Developers](https://developers.facebook.com/)
2. Crea una nueva app
3. Agrega el producto **Facebook Login**
4. Ve a **Herramientas** → **Graph API Explorer**
5. Selecciona tu página
6. Solicita permisos: `pages_manage_posts`, `pages_read_engagement`, `publish_video`
7. Genera un **Access Token de larga duración**

### 2. Convertir Token a Long-Lived (60 días)

```bash
curl -i -X GET "https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=TU_APP_ID&client_secret=TU_APP_SECRET&fb_exchange_token=TU_SHORT_LIVED_TOKEN"
```

### 3. Guardar Token en la Tabla `canales`

Estructura del campo `credenciales` (jsonb):

```json
{
  "facebook": {
    "page_id": "tu-page-id",
    "access_token": "tu-long-lived-access-token"
  }
}
```

### 4. Implementar Función `publicarEnFacebook`

Reemplaza el código placeholder en `video-generator.js`:

```javascript
async function publicarEnFacebook(video, canal, rutaVideoLocal) {
  console.log('📘 Publicando en Facebook...');
  
  try {
    const FormData = require('form-data');
    
    const credenciales = canal.credenciales?.facebook;
    if (!credenciales || !credenciales.access_token) {
      throw new Error('Canal no tiene credenciales de Facebook configuradas');
    }

    const pageId = credenciales.page_id;
    const accessToken = credenciales.access_token;

    // Paso 1: Iniciar carga del video
    const initResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/videos`,
      {
        method: 'POST',
        body: new URLSearchParams({
          upload_phase: 'start',
          access_token: accessToken,
          file_size: fs.statSync(rutaVideoLocal).size
        })
      }
    );

    const initData = await initResponse.json();
    const videoId = initData.video_id;
    const uploadSessionId = initData.upload_session_id;

    // Paso 2: Subir el video
    const form = new FormData();
    form.append('upload_phase', 'transfer');
    form.append('upload_session_id', uploadSessionId);
    form.append('access_token', accessToken);
    form.append('video_file_chunk', fs.createReadStream(rutaVideoLocal));

    const uploadResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/videos`,
      {
        method: 'POST',
        body: form
      }
    );

    // Paso 3: Finalizar carga
    const finishResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/videos`,
      {
        method: 'POST',
        body: new URLSearchParams({
          upload_phase: 'finish',
          upload_session_id: uploadSessionId,
          access_token: accessToken,
          title: video.titulo,
          description: video.descripcion || ''
        })
      }
    );

    const finishData = await finishResponse.json();
    
    console.log(`✅ Video subido a Facebook: ${finishData.id}`);
    
    return finishData.id;
    
  } catch (error) {
    console.error('❌ Error al publicar en Facebook:', error.message);
    throw error;
  }
}
```

### 5. Instalar Dependencia para Facebook

```bash
npm install form-data
```

---

## 🗄️ Estructura de la Tabla `canales`

Asegúrate de que tu tabla `canales` tenga esta estructura:

```sql
CREATE TABLE IF NOT EXISTS public.canales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  plataforma TEXT NOT NULL, -- 'youtube' o 'facebook'
  credenciales JSONB DEFAULT '{}'::jsonb,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsquedas por plataforma
CREATE INDEX idx_canales_plataforma ON canales(plataforma);
```

---

## 📊 Flujo Completo del Sistema

```
1. GENERACIÓN (cada 10 min)
   ├─ Buscar guiones con estado "producir_video"
   ├─ Generar video con subtítulos
   ├─ Subir a Supabase Storage
   ├─ Registrar en tabla 'videos' (estado: pendiente_publicar)
   └─ Actualizar guion (estado: video_producido)

2. PROGRAMACIÓN (cada 5 min)
   ├─ Buscar videos con estado "pendiente_publicar"
   ├─ Sin hora programada
   ├─ Asignar próxima hora disponible por canal
   └─ Actualizar campo publicacion_programada_at

3. PUBLICACIÓN (cada 5 min)
   ├─ Buscar videos con estado "pendiente_publicar"
   ├─ Con hora programada <= ahora
   ├─ Descargar video desde Storage
   ├─ Publicar en plataforma del canal (YouTube/Facebook)
   ├─ Guardar ID externo (youtube_video_id/facebook_post_id)
   └─ Actualizar estado a "publicado"
```

---

## 🔐 Variables de Entorno Necesarias

```env
# YouTube
YOUTUBE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=tu-client-secret
YOUTUBE_REDIRECT_URI=http://localhost:3000/oauth2callback

# Facebook
FACEBOOK_ACCESS_TOKEN=tu-token-de-larga-duracion
```

---

## ✅ Próximos Pasos

1. ✅ Ejecutar SQL para agregar campo `publicacion_programada_at`
2. ⚠️  Instalar `googleapis` y `form-data`
3. ⚠️  Configurar credenciales de YouTube y Facebook
4. ⚠️  Implementar funciones de publicación
5. ⚠️  Probar con un video de prueba

---

## 🐛 Debug y Logs

El sistema incluye logs detallados:
- ✅ Videos consultados para publicar
- 📺 Intento de publicación en cada plataforma
- ❌ Errores detallados con stack trace
- 📊 Resumen final (publicados/errores)

---

## 📝 Notas Importantes

- **YouTube:** Cuota diaria de 10,000 unidades (1 upload = 1,600 unidades = ~6 videos/día)
- **Facebook:** Long-lived tokens expiran cada 60 días (renuévalos)
- **Granja de canales:** Cada canal debe tener sus propias credenciales en el campo `credenciales`
- **Estado del video:** Cambia de `pendiente_publicar` → `publicado` automáticamente
