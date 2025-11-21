# Generador Automático de Videos

Script automatizado en Node.js que genera videos combinando imágenes con efecto Ken Burns y audio, a partir de datos almacenados en Supabase.

## 🎯 Características

- ✅ Ejecución automática cada 10 minutos mediante cron
- ✅ Consulta automática del último guion creado en Supabase
- ✅ Descarga de imágenes y audio desde Supabase Storage
- ✅ Ordenamiento de imágenes por número de escena
- ✅ Cálculo automático de duración por imagen basado en el audio
- ✅ Efecto Ken Burns (zoom in/out) en cada imagen
- ✅ Generación de video MP4 en resolución 1920x1080
- ✅ Codec H.264 optimizado
- ✅ Limpieza automática de archivos temporales

## 📋 Requisitos

- Node.js 14 o superior
- FFmpeg instalado en el sistema (las dependencias lo instalan automáticamente)
- Cuenta de Supabase con acceso a las tablas `guiones` y `media_assets`

## 🚀 Instalación

1. **Clonar o descargar los archivos**

2. **Instalar dependencias**

```bash
npm install
```

3. **Configurar variables de entorno**

Copia el archivo `.env.example` a `.env` y configura tus credenciales:

```bash
cp .env.example .env
```

Edita el archivo `.env`:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-clave-anon-key-aqui
```

4. **Ejecutar el script**

```bash
npm start
```

## 📁 Estructura de Carpetas

```
yocoia_backend/
├── video-generator.js    # Script principal
├── package.json          # Dependencias
├── .env                  # Variables de entorno (no incluir en git)
├── .env.example          # Plantilla de variables de entorno
├── temp/                 # Archivos temporales (creada automáticamente)
└── exports/              # Videos generados (creada automáticamente)
```

## 🔧 Funcionamiento

### Flujo del Proceso

1. **Cada 10 minutos**, el cron ejecuta el proceso
2. **Consulta** el último guion de la tabla `guiones` (ORDER BY created_at DESC)
3. **Obtiene** todas las imágenes y el audio asociados desde `media_assets`
4. **Valida** que existan audio e imágenes
5. **Ordena** las imágenes por el campo `metadata.escena`
6. **Descarga** todas las imágenes y el audio a la carpeta `temp/`
7. **Calcula** la duración de cada imagen: `duración_audio / cantidad_imágenes`
8. **Genera** el video con FFmpeg aplicando:
   - Efecto Ken Burns (zoom de 1.0 a 1.2 al inicio, de 1.2 a 1.0 al final)
   - Resolución 1920x1080
   - Codec H.264
   - Audio sincronizado
9. **Guarda** el video en la carpeta `exports/`
10. **Limpia** los archivos temporales

### Estructura del metadata de imágenes

Cada imagen en `media_assets` debe tener un campo `metadata` con la siguiente estructura:

```json
{
  "tipo": "generada",
  "escena": 5,
  "prompt": "Genera una imagen hiperrealista...",
  "source": "nanobanana",
  "size_bytes": 268345
}
```

El campo `escena` es crucial para el ordenamiento correcto de las imágenes.

## ⚠️ Validaciones

- Si no existe audio, el proceso se detiene y registra error
- Si no existen imágenes, el proceso se detiene y registra error
- Si una imagen no tiene `metadata.escena`, se muestra advertencia y se coloca al final
- Todas las validaciones se registran en consola con emojis identificadores

## 🎬 Configuración de Video

Puedes modificar las siguientes constantes en `video-generator.js`:

```javascript
const VIDEO_CONFIG = {
  width: 1920,        // Ancho del video
  height: 1080,       // Alto del video
  codec: 'libx264',   // Codec de video
  preset: 'medium',   // Velocidad de encoding (ultrafast, fast, medium, slow)
  crf: 23,            // Calidad (0-51, menor = mejor calidad)
  pixelFormat: 'yuv420p'
};

const KEN_BURNS = {
  zoomStart: 1.0,     // Zoom inicial
  zoomEnd: 1.2        // Zoom final
};
```

## 📊 Logs

El script proporciona logs detallados en consola:

- 🎬 Inicio del proceso
- 📋 Consultas a base de datos
- ⬇️ Descargas de archivos
- ⏱️ Duración de audio calculada
- 🎥 Progreso de generación de video
- ✅ Confirmaciones de éxito
- ❌ Errores con detalles
- ⚠️ Advertencias

## 🛑 Detener el Servicio

Presiona `Ctrl + C` en la terminal para detener el servicio de manera segura. El script limpiará automáticamente los archivos temporales antes de cerrarse.

## 🐛 Troubleshooting

### Error: "Faltan variables de entorno"
Verifica que el archivo `.env` exista y contenga `SUPABASE_URL` y `SUPABASE_KEY`.

### Error: "No se encontró archivo de audio"
Verifica que existe un registro en `media_assets` con `tipo='audio'` para el guion consultado.

### Error en FFmpeg
- Verifica que las imágenes sean archivos válidos (JPG, PNG)
- Verifica que el audio sea MP3 válido
- Revisa los logs detallados de FFmpeg en consola

### No se genera video
- Verifica que existan guiones en la tabla `guiones`
- Verifica que el guion tenga imágenes y audio asociados en `media_assets`
- Revisa los permisos de las carpetas `temp/` y `exports/`

## 📝 Notas Técnicas

- El script descarga archivos temporalmente para procesarlos localmente
- Los archivos temporales se eliminan automáticamente después de cada ejecución
- El video generado incluye el ID del guion y timestamp en el nombre del archivo
- El audio se codifica en AAC a 192kbps
- El efecto Ken Burns se aplica a 30 fps para fluidez óptima

## 🔜 Próximas Mejoras (No Implementadas)

- Guardar el video generado en Supabase Storage
- Crear registro en `media_assets` con `tipo='video'`
- Actualizar estado del guion en la tabla `guiones`
- Sistema de logs persistente en archivos
- Validación de videos duplicados antes de generar
- Notificaciones de éxito/error

## 📄 Licencia

ISC
