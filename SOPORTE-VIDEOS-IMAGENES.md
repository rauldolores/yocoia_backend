# Soporte de Videos e Imágenes en Generación de Videos

## Resumen de Cambios

Se ha mejorado `src/services/video/generator.js` para soportar **mezcla de videos e imágenes** como entrada, manteniendo el efecto Ken Burns en ambos tipos de media.

## Características Implementadas

### 1. **Detección Automática de Tipo de Media**

Nuevas funciones auxiliares:
- `esVideo(rutaArchivo)`: Detecta archivos de video (.mp4, .mov, .avi, .mkv, .webm, .flv, .m4v)
- `esImagen(rutaArchivo)`: Detecta archivos de imagen (.jpg, .jpeg, .png, .webp, .gif, .bmp)
- `obtenerDuracionVideo(rutaVideo)`: Obtiene la duración real de un video usando ffprobe

### 2. **Estrategia de Duración Híbrida para Videos**

Para cada video:
- Si `duraciónOriginal ≤ duraciónBase`: Usa la duración completa del video
- Si `duraciónOriginal > duraciónBase`: Recorta el video a `duraciónBase` segundos

Esto permite mantener clips cortos completos mientras recorta clips largos.

### 3. **Ken Burns en Videos e Imágenes**

El efecto Ken Burns (zoom + pan) ahora se aplica a **ambos tipos de media**:
- **Imágenes**: Comportamiento original (loop + zoompan)
- **Videos**: Mismo efecto zoompan aplicado sobre el video en movimiento

### 4. **Manejo Inteligente de Inputs FFmpeg**

- **Imágenes**: Se agregan con `-loop 1` para repetir el frame
- **Videos sin recorte**: Se agregan directamente
- **Videos con recorte**: Se agregan con `-t <duración>` para limitar

## Cambios en el Código

### Función Principal

```javascript
async function generarVideo(rutasMedias, rutaAudio, duracionPorSegmento, rutaSalida, rutaASS = null)
```

**Cambios de parámetros:**
- `rutasImagenes` → `rutasMedias` (ahora acepta imágenes y videos)
- `duracionPorImagen` → `duracionPorSegmento` (nombre más genérico)

### Análisis de Medias

```javascript
const mediasInfo = [];
for (let i = 0; i < rutasMedias.length; i++) {
  const info = {
    ruta: rutaMedia,
    esVideo: esVideo(rutaMedia),
    esImagen: esImagen(rutaMedia),
    duracionSegmento: duracionPorSegmento,
    necesitaRecorte: false
  };
  
  if (info.esVideo) {
    const duracionOriginal = await obtenerDuracionVideo(rutaMedia);
    info.duracionSegmento = Math.min(duracionOriginal, duracionPorSegmento);
    info.necesitaRecorte = duracionOriginal > duracionPorSegmento;
  }
  
  mediasInfo.push(info);
}
```

### Aplicación de Inputs

```javascript
mediasInfo.forEach(info => {
  if (info.esImagen) {
    comando = comando.input(info.ruta).inputOptions(['-loop 1']);
  } else if (info.esVideo) {
    if (info.necesitaRecorte) {
      comando = comando.input(info.ruta).inputOptions(['-t', info.duracionSegmento.toString()]);
    } else {
      comando = comando.input(info.ruta);
    }
  }
});
```

### Filtros Ken Burns

Los filtros zoompan se aplican de forma idéntica a imágenes y videos:

```javascript
mediasInfo.forEach((info, index) => {
  const duracionFrames = Math.floor(info.duracionSegmento * fps);
  // ... mismo código de zoompan para ambos tipos
  const filtro = `${inputLabel}scale=...crop=...zoompan=z='...'...`;
  filtros.push(filtro);
});
```

## Compatibilidad

### ✅ Retrocompatibilidad Total

El código existente que solo pasa imágenes **sigue funcionando sin cambios**:

```javascript
// Esto sigue funcionando igual que antes
await generarVideo(
  ['imagen1.jpg', 'imagen2.png', 'imagen3.jpg'],
  'audio.mp3',
  5.0,
  'output.mp4'
);
```

### ✅ Soporte de Videos

Ahora también se pueden incluir videos:

```javascript
// Mezcla de imágenes y videos
await generarVideo(
  ['imagen1.jpg', 'video1.mp4', 'imagen2.png', 'video2.mov'],
  'audio.mp3',
  5.0,
  'output.mp4'
);
```

## Ejemplos de Uso

### Ejemplo 1: Solo Imágenes (comportamiento original)
```javascript
await generarVideo(
  ['foto1.jpg', 'foto2.jpg', 'foto3.jpg'],
  'musica.mp3',
  4.5,
  'salida.mp4',
  'subtitulos.ass'
);
```

**Resultado:**
- Cada imagen dura 4.5 segundos
- Ken Burns aplicado a todas
- Total: 13.5 segundos

### Ejemplo 2: Solo Videos (nuevo)
```javascript
await generarVideo(
  ['clip1.mp4', 'clip2.mp4', 'clip3.mp4'],
  'musica.mp3',
  5.0,
  'salida.mp4'
);
```

**Resultado (duración híbrida):**
- clip1.mp4 (3s original) → usa 3s completos
- clip2.mp4 (7s original) → recorta a 5s
- clip3.mp4 (4.5s original) → usa 4.5s completos
- Ken Burns aplicado a todos
- Total: 12.5 segundos

### Ejemplo 3: Mezcla de Imágenes y Videos (nuevo)
```javascript
await generarVideo(
  ['intro.mp4', 'foto1.jpg', 'clip.mp4', 'foto2.jpg'],
  'musica.mp3',
  6.0,
  'salida.mp4',
  'subtitulos.ass'
);
```

**Resultado (híbrido):**
- intro.mp4 (4s original) → usa 4s completos + Ken Burns
- foto1.jpg → 6s estáticos + Ken Burns
- clip.mp4 (8s original) → recorta a 6s + Ken Burns
- foto2.jpg → 6s estáticos + Ken Burns
- Total: 22 segundos

## Ventajas

1. **Flexibilidad**: Acepta cualquier combinación de imágenes y videos
2. **Ken Burns Universal**: El efecto funciona en ambos tipos de media
3. **Duración Inteligente**: Videos cortos se usan completos, largos se recortan
4. **Retrocompatible**: El código existente sigue funcionando sin cambios
5. **Sin pérdida de funcionalidad**: Subtítulos, color grading y audio se mantienen

## Logs de Depuración

La función ahora muestra información detallada de cada media:

```
🔍 === INFORMACIÓN DE DEPURACIÓN ===
🎬 Iniciando generación de video con soporte de videos e imágenes...
   - Total de medias: 4
   - Duración base por segmento: 5.00s
   [0] 🎥 VIDEO: intro.mp4
       Duración original: 3.50s
       Duración a usar: 3.50s (completo)
   [1] 🖼️  IMAGEN: foto1.jpg
       Duración: 5.00s
   [2] 🎥 VIDEO: clip.mp4
       Duración original: 8.20s
       Duración a usar: 5.00s (recortado)
   [3] 🖼️  IMAGEN: foto2.jpg
       Duración: 5.00s
   - Duración total estimada: 18.50s
```

## Archivos Modificados

1. **src/services/video/generator.js**
   - Funciones auxiliares: `esVideo()`, `esImagen()`, `obtenerDuracionVideo()`
   - Cambio de firma: `generarVideo(rutasMedias, ...)`
   - Análisis de medias con duración híbrida
   - Input handling diferenciado por tipo
   - Filtros Ken Burns aplicados a ambos tipos

2. **src/jobs/video-generator.js**
   - Comentarios actualizados explicando el soporte de videos
   - Sin cambios en la lógica (retrocompatible)

## Testing

Ejecutar test de detección:
```bash
node test-media-detection.js
```

## Notas Técnicas

- Los videos mantienen su framerate original hasta el filtro zoompan
- El zoompan normaliza todo a fps configurado (30fps por defecto)
- SAR (Sample Aspect Ratio) se fuerza a 1:1 para evitar errores en concat
- El filtro concat funciona igual para n inputs de cualquier tipo
- Audio mapping se ajusta automáticamente según cantidad de inputs

## Próximos Pasos Sugeridos

1. Actualizar generador de imágenes para soportar videos como assets
2. Permitir configuración de estrategia de duración (completo/recorte/stretch)
3. Añadir transiciones entre clips mixtos
4. Soporte de Ken Burns configurable por segmento

---

**Fecha de implementación**: 2024
**Autor**: Desarrollo KONTROLIA
