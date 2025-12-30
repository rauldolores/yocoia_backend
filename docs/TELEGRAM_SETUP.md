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

### Opción A: Usando @userinfobot
1. Busca **@userinfobot** en Telegram
2. Inicia una conversación con el bot
3. Te mostrará tu **Chat ID** (un número como `123456789`)

### Opción B: Usando @getidsbot
1. Busca **@getidsbot** en Telegram
2. Envía cualquier mensaje
3. El bot te responderá con tu Chat ID

### Opción C: Para un grupo
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
- Si usas un grupo, el `CHAT_ID` debe empezar con `-` (ej: `-1234567890`)
- No compartas tu token con nadie

## ✅ Paso 4: Probar la Configuración

1. Reinicia el servidor Node.js
2. El sistema enviará notificaciones automáticamente cuando:
   - Se publique un video en YouTube
   - Se publique un video en Facebook
   - Se complete un video largo
   - Ocurra un error durante el procesamiento

## 📋 Tipos de Notificaciones

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
