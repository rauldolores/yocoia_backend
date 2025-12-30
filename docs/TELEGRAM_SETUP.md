# 📱 Configuración de Notificaciones de Telegram

Este documento explica cómo configurar las notificaciones de Telegram para recibir alertas sobre publicaciones y errores del sistema.

## 🤖 Paso 1: Crear un Bot de Telegram

1. Abre Telegram y busca **@BotFather**
2. Envía el comando `/newbot`
3. Sigue las instrucciones:
   - Nombre del bot: `Yocoia Notificaciones` (o el que prefieras)
   - Username del bot: `yocoia_notif_bot` (debe terminar en `_bot`)
4. BotFather te dará un **token** como este:
   ```
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890
   ```
5. **Guarda este token**, lo necesitarás después

## 💬 Paso 2: Obtener tu Chat ID

**⚠️ IMPORTANTE: Primero debes iniciar una conversación con tu bot**

### Paso 2.1: Iniciar conversación con el bot
1. En Telegram, busca tu bot usando el username que creaste (ejemplo: `@yocoia_notif_bot`)
2. Haz clic en **"START"** o envía cualquier mensaje (ejemplo: `/start` o `Hola`)
3. **Este paso es obligatorio** - si no envías un mensaje primero, el bot no podrá encontrar el chat

### Paso 2.2: Obtener el Chat ID

#### Opción A: Usando la API de Telegram (RECOMENDADO)
1. **Envía un mensaje al bot** (si no lo hiciste en el paso anterior)
2. Abre en tu navegador:
   ```
   https://api.telegram.org/bot<TU_TOKEN>/getUpdates
   ```
   - Reemplaza `<TU_TOKEN>` con el token completo de tu bot
   - Ejemplo: `https://api.telegram.org/bot1234567890:ABCdefGHI/getUpdates`

3. Verás una respuesta JSON como esta:
   ```json
   {
     "ok": true,
     "result": [
       {
         "update_id": 123456789,
         "message": {
           "message_id": 1,
           "from": { "id": 987654321, ... },
           "chat": {
             "id": 987654321,
             "first_name": "Tu Nombre",
             "type": "private"
           },
           ...
         }
       }
     ]
   }
   ```

4. **Tu Chat ID es el número en `"chat":{"id":987654321}`**

5. **Si ves `"result":[]` (vacío)**:
   - ❌ No enviaste ningún mensaje al bot todavía
   - ✅ Envía un mensaje al bot y vuelve a cargar la URL

#### Opción B: Usando @userinfobot
1. Busca **@userinfobot** en Telegram
2. Inicia una conversación con el bot
3. Te mostrará tu **Chat ID** (un número como `123456789`)

#### Opción C: Usando @getidsbot
1. Busca **@getidsbot** en Telegram
2. Envía cualquier mensaje
3. El bot te responderá con tu Chat ID

### Para usar con un grupo:
1. Agrega tu bot al grupo
2. Envía cualquier mensaje en el grupo
3. Visita: `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
4. Busca `"chat":{"id":-1234567890}` en la respuesta
5. El Chat ID de un grupo **siempre empieza con `-`**

## ⚙️ Paso 3: Configurar el archivo .env

Edita tu archivo `.env` y agrega:

```env
# Configuración de Telegram (Notificaciones)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890
TELEGRAM_CHAT_ID=123456789
```

**Importante:**
- **Debes enviar un mensaje al bot ANTES de configurar**, de lo contrario verás el error: `chat not found`
- Si usas un grupo, el `CHAT_ID` debe empezar con `-` (ej: `-1234567890`)
- No compartas tu token con nadie

## ✅ Paso 4: Verificar la Configuración

### Método 1: Reiniciar el servidor
1. Reinicia el servidor Node.js con `npm run dev`
2. Deberías recibir un mensaje de inicio en Telegram con información del sistema

### Método 2: Enviar mensaje de prueba
Crea un archivo `test-telegram.js`:
```javascript
require('dotenv').config();
const axios = require('axios');

async function testTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!token || !chatId) {
    console.log('❌ Faltan variables de entorno');
    return;
  }
  
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: '✅ Prueba de Telegram exitosa!'
      }
    );
    console.log('✅ Mensaje enviado correctamente');
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }
}

testTelegram();
```

Ejecuta: `node test-telegram.js`

### Errores comunes:

| Error | Causa | Solución |
|-------|-------|----------|
| `chat not found` | No has enviado un mensaje al bot | Abre Telegram, busca tu bot y envía `/start` |
| `Unauthorized` | Token incorrecto | Verifica el token en `.env` |
| `Bad Request: chat_id is empty` | CHAT_ID no configurado | Verifica el chat ID en `.env` |

## 📋 Tipos de Notificaciones

El sistema enviará notificaciones automáticamente cuando:
- 🚀 El sistema se inicia (con detalles del servidor y configuración)
- ✅ Se publique un video en YouTube
- ✅ Se publique un video en Facebook
- 🎬 Se complete un video largo
- ❌ Ocurra un error durante el procesamiento

## 🔕 Desactivar Notificaciones (Opcional)

Si no quieres recibir notificaciones, simplemente:
1. No configures las variables `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` en `.env`
2. O déjalas vacías:
   ```env
   TELEGRAM_BOT_TOKEN=
   TELEGRAM_CHAT_ID=
   ```

El sistema funcionará normalmente sin enviar notificaciones.

### ℹ️ INFO - Publicación Exitosa
```
📺 INFO: Video Publicado

📱 Short
Canal: Mi Canal
Plataforma: YOUTUBE
Título: Video Ejemplo #Shorts

🔗 Ver video
```

### 🎬 INFO - Video Largo
```
🎬 INFO: Iniciando Video Largo

Canal: Mi Canal
Título: Historia del Imperio Romano
Secciones: 5

⏳ Procesando...
```

### ❌ ERROR - Fallo en Publicación
```
📤 ERROR: PUBLICACION

Mensaje: Error al publicar en YouTube
Contexto: Canal: Mi Canal - Video: Título del Video

Detalle técnico:
Video quota exceeded
```

## 🔕 Desactivar Notificaciones

Si no quieres recibir notificaciones, simplemente **no configures** las variables de entorno `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` en tu archivo `.env`.

El sistema detectará automáticamente que Telegram no está configurado y **no intentará enviar mensajes**.

## 🛠️ Solución de Problemas

### Error: "Unauthorized"
- Verifica que el token del bot sea correcto
- Asegúrate de haber iniciado conversación con el bot (envía `/start`)

### Error: "Chat not found"
- Verifica que el Chat ID sea correcto
- Si es un grupo, asegúrate de que empiece con `-`
- Verifica que el bot esté en el grupo (si aplica)

### No recibo mensajes
- Verifica que las variables estén en el archivo `.env`
- Reinicia el servidor después de configurar
- Revisa los logs de la consola para ver si hay errores de Telegram

## 📚 Más Información

- [Documentación oficial de Telegram Bots](https://core.telegram.org/bots)
- [Bot API Reference](https://core.telegram.org/bots/api)
