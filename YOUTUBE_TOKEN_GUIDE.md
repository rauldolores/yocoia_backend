# 🎥 Cómo Obtener Refresh Tokens de YouTube

## 📋 Requisitos Previos

1. **Tener un proyecto en Google Cloud Console**
   - Si no tienes uno, créalo en: https://console.cloud.google.com/

2. **Habilitar YouTube Data API v3**
   - En tu proyecto, ve a "APIs y Servicios" → "Biblioteca"
   - Busca "YouTube Data API v3" y habilítala

3. **Crear credenciales OAuth 2.0**
   - Ve a "APIs y Servicios" → "Credenciales"
   - **IMPORTANTE:** Si es la primera vez, necesitas configurar la "Pantalla de consentimiento OAuth":
     - Ve a "Pantalla de consentimiento de OAuth"
     - Tipo de usuario: **Externo** (o Interno si es workspace)
     - Nombre de la aplicación: "Video Generator"
     - Correo del usuario: tu email
     - Guarda y continúa (puedes saltar los permisos opcionales)
   - Ahora ve a "Credenciales" → "Crear credenciales" → "ID de cliente de OAuth 2.0"
   - Tipo de aplicación: **Aplicación web**
   - Nombre: "Video Generator Web Client" (o el que prefieras)
   - **Orígenes de JavaScript autorizados:** `http://localhost:3000`
   - **URI de redirección autorizados:** `http://localhost:3000/oauth2callback`
   - Clic en "Crear"
   - **COPIA EXACTAMENTE el Client ID y Client Secret que aparecen**

4. **Configurar .env**
   ```bash
   cp .env.example .env
   ```
   
   Edita `.env` y agrega tus credenciales:
   ```env
   YOUTUBE_CLIENT_ID=tu-client-id-de-google.apps.googleusercontent.com
   YOUTUBE_CLIENT_SECRET=tu-client-secret-de-google
   YOUTUBE_REDIRECT_URI=http://localhost:3000/oauth2callback
   ```

5. **Instalar googleapis**
   ```bash
   npm install googleapis
   ```

## 🚀 Paso a Paso

### 1. Ejecutar el script

```bash
node obtener-youtube-token.js
```

### 2. El script mostrará algo como:

```
================================================================================
🎥 OBTENER REFRESH TOKEN DE YOUTUBE
================================================================================

📋 Configuración actual:
   Client ID: 123456789012-abc...
   Client Secret: GOCSPX-abc...
   Redirect URI: http://localhost:3000/oauth2callback

🔗 PASO 1: Abre esta URL en tu navegador:

https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=...

--------------------------------------------------------------------------------

📝 PASO 2: Autoriza el acceso con la cuenta del canal de YouTube

📝 PASO 3: Serás redirigido a una URL que empieza con:
   http://localhost:3000/oauth2callback?code=...

   (Si ves un error de "sitio no disponible", está bien, solo copia la URL)

📝 PASO 4: Pega el CÓDIGO de la URL (la parte después de "?code="):
```

### 3. Copiar la URL y abrirla

- Copia la URL larga que empieza con `https://accounts.google.com/...`
- Pégala en tu navegador
- **IMPORTANTE:** Usa la cuenta de Google asociada al canal de YouTube que quieres agregar

### 4. Autorizar el acceso

**IMPORTANTE:** Google mostrará una advertencia: **"Google no verificó esta app"**

Esto es **NORMAL** porque tu app está en modo de prueba. Para continuar:

1. **Haz clic en "Avanzado"** (o "Advanced" en inglés)
2. **Haz clic en "Ir a Video Generator (no seguro)"** (o el nombre de tu app)
3. Ahora verás la pantalla de permisos normal

Google te pedirá:
- Seleccionar la cuenta
- Revisar los permisos (subir videos, administrar canal)
- Hacer clic en "Permitir" o "Allow"

**Nota:** Esta advertencia aparecerá siempre mientras tu app esté en modo de prueba. Es completamente seguro continuar porque **tú eres el desarrollador**.

### 5. Copiar el código

Serás redirigido a una URL como:
```
http://localhost:3000/oauth2callback?code=4/0AeanS0ZSZ...&scope=https://...
```

**Opciones:**
- **Si tienes un error "Sitio no disponible":** Está bien, solo copia la URL completa de la barra de direcciones
- **Si configuraste un servidor local:** La página se cargará normalmente

Del ejemplo anterior, copia solo la parte del código:
```
4/0AeanS0ZSZ...
```

### 6. Pegar el código en la terminal

El script te pedirá:
```
📝 PASO 4: Pega el CÓDIGO de la URL (la parte después de "?code="): 
```

Pega el código y presiona Enter.

### 7. ¡Listo! Obtendrás el refresh token

```
✅ Tokens obtenidos correctamente

🔍 Verificando acceso al canal...

✅ Canal verificado:

   📺 Nombre: Mi Canal de YouTube
   🆔 ID: UCxxxxxxxxxxxxxxxxx
   👥 Suscriptores: 1234
   🎬 Videos: 56
   👁️  Vistas: 123456

================================================================================
✅ REFRESH TOKEN OBTENIDO
================================================================================

🔑 REFRESH TOKEN (guárdalo en tu base de datos):

1//0gSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

--------------------------------------------------------------------------------

📋 SQL para insertar/actualizar el canal:

INSERT INTO canales (nombre, plataforma, credenciales)
VALUES (
  'Mi Canal de YouTube',
  'youtube',
  '{"youtube": {"refresh_token": "1//0gSx..."}}'::jsonb
);

-- O si ya existe el canal, actualiza solo las credenciales:

UPDATE canales
SET credenciales = jsonb_set(
  COALESCE(credenciales, '{}'::jsonb),
  '{youtube}',
  '{"refresh_token": "1//0gSx..."}'::jsonb
)
WHERE nombre = 'Mi Canal de YouTube' AND plataforma = 'youtube';
```

### 8. Guardar en la base de datos

Copia el SQL que te muestra el script y ejecútalo en tu base de datos Supabase.

## 🔄 Repetir para Múltiples Canales

Para agregar más canales:

1. **Vuelve a ejecutar el script:**
   ```bash
   node obtener-youtube-token.js
   ```

2. **Autoriza con una cuenta diferente**
   - Si ya estás logueado en Google, primero cierra sesión o usa navegación privada
   - Autoriza con la cuenta del siguiente canal

3. **Guarda el nuevo refresh token**
   - Cada canal tendrá su propio refresh token
   - Todos pueden usar el mismo CLIENT_ID y CLIENT_SECRET

## 💡 Ventajas de Este Método

✅ **Un solo Client ID/Secret para todos los canales**
- Solo necesitas configurar la app de Google una vez
- Cada canal solo necesita su propio refresh token

✅ **Refresh tokens no expiran**
- A diferencia de los access tokens (1 hora)
- Los refresh tokens son permanentes (hasta que revoques el acceso)

✅ **Fácil de renovar**
- Si necesitas revocar y generar nuevo token: https://myaccount.google.com/permissions
- Revoca el acceso y vuelve a ejecutar el script

## 🐛 Solución de Problemas

### "Error 401: invalid_client" o "The OAuth client was not found"
**Causa:** El Client ID en tu .env no existe o está mal copiado.

**Solución:**
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Asegúrate de estar en el proyecto correcto (verifica el nombre en la parte superior)
3. Ve a "APIs y Servicios" → "Credenciales"
4. Busca tu cliente OAuth 2.0 en la lista
5. **Haz clic en el nombre** para ver los detalles
6. **Copia exactamente** el "ID de cliente" que aparece
7. Pégalo en tu `.env` como `YOUTUBE_CLIENT_ID`
8. Asegúrate de que **NO haya espacios** al inicio o final
9. Verifica que la URI de redirección sea exactamente: `http://localhost:3000/oauth2callback`

**Verificación rápida:**
```bash
# El Client ID debe verse así:
# 123456789012-abc123def456ghi789jkl012mno345pq.apps.googleusercontent.com

# El Client Secret debe verse así:
# GOCSPX-abcdefghijklmnopqrstuvwx
```

### "No se obtuvo refresh_token"
**Causa:** Ya autorizaste esta app antes con esa cuenta.

**Solución:**
1. Ve a https://myaccount.google.com/permissions
2. Busca tu app "Video Generator" (o el nombre que le diste)
3. Haz clic en "Revocar acceso"
4. Vuelve a ejecutar el script

### "Google no verificó esta app" o "This app isn't verified"
**Causa:** Tu app está en modo de prueba (esto es NORMAL).

**Solución:**
1. Haz clic en **"Avanzado"** (o "Advanced")
2. Haz clic en **"Ir a [nombre de tu app] (no seguro)"** (o "Go to [app name] (unsafe)")
3. Continúa con el proceso de autorización normalmente
4. Haz clic en "Permitir" cuando te pida permisos

**Nota:** Esta advertencia es normal para apps en desarrollo. No necesitas verificar tu app con Google a menos que quieras que otros usuarios (no tú) la usen.

### "No se encontró ningún canal"
**Causa:** La cuenta de Google no tiene un canal de YouTube asociado.

**Solución:**
- Crea un canal en YouTube con esa cuenta primero
- O autoriza con una cuenta diferente que sí tenga canal

### "Error 400: redirect_uri_mismatch" o "Invalid redirect_uri"
**Causa:** El REDIRECT_URI en .env no coincide EXACTAMENTE con el configurado en Google Cloud Console.

**Solución:**
1. Ve a [Google Cloud Console](https://console.cloud.google.com/) → "APIs y Servicios" → "Credenciales"
2. Haz clic en tu cliente OAuth 2.0 para editarlo
3. En la sección **"URI de redirección autorizados"**, agrega EXACTAMENTE:
   ```
   http://localhost:3000/oauth2callback
   ```
4. **IMPORTANTE:** 
   - Sin `https://` (debe ser `http://`)
   - Sin barra final `/` al final
   - Exactamente `localhost` (no `127.0.0.1`)
   - Puerto `3000`
5. Haz clic en "Guardar"
6. Espera 1-2 minutos para que se propague el cambio
7. Vuelve a ejecutar el script

**Verificación en .env:**
```env
YOUTUBE_REDIRECT_URI=http://localhost:3000/oauth2callback
```
(Debe ser EXACTAMENTE igual a lo que pusiste en Google Cloud Console)

## 📊 Estructura Final en la Base de Datos

Después de agregar varios canales, tu tabla `canales` debería verse así:

```sql
SELECT id, nombre, plataforma, credenciales->'youtube'->>'refresh_token' as token
FROM canales
WHERE plataforma = 'youtube';
```

Resultado:
```
id                                   | nombre              | plataforma | token
-------------------------------------|---------------------|------------|-------------------------
a1b2c3d4-...                         | Canal Principal     | youtube    | 1//0gSxxx...
e5f6g7h8-...                         | Canal Secundario    | youtube    | 1//0hTyyy...
i9j0k1l2-...                         | Canal de Noticias   | youtube    | 1//0iUzzz...
```

## 🔐 Seguridad

⚠️ **IMPORTANTE:**
- Nunca compartas tus refresh tokens
- Nunca los subas a GitHub (usa .env)
- Guárdalos de forma segura en la base de datos
- Si crees que un token fue comprometido, revócalo inmediatamente

## ✅ Siguiente Paso

Una vez que tengas los refresh tokens guardados:

1. Instala las dependencias necesarias:
   ```bash
   npm install googleapis form-data
   ```

2. El script `video-generator.js` ya está listo para usarlos automáticamente

3. Los videos se publicarán automáticamente según la hora programada

## 📞 Soporte

Si tienes problemas:
- Revisa los logs del script
- Verifica que las credenciales en .env sean correctas
- Asegúrate de haber habilitado YouTube Data API v3
- Verifica los permisos OAuth en Google Cloud Console
