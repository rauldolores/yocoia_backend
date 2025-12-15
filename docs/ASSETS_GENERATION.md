# Generación de Assets (Audio e Imágenes)

## Descripción

Este proceso automático genera los recursos multimedia (audio e imágenes) necesarios para los guiones que están en estado `generado` y aún no tienen video asociado. **Solo procesa canales con `generacion_automatica = true`** e implementa un sistema de gestión de stock que mantiene un número configurable de guiones listos para producir video, procesando solo lo necesario para mantener el pipeline activo.

## Características

- **Filtrado automático**: Solo procesa canales con `generacion_automatica = true`
- **Ejecución periódica**: Configurable cada N minutos (default: 8 minutos)
- **Gestión de stock**: Solo procesa guiones hasta alcanzar el umbral de videos listos
- **Por canal**: Controla el stock independientemente para cada canal
- **No concurrente**: Usa un lock para prevenir ejecuciones simultáneas
- **Validación inteligente**: Solo procesa guiones sin video generado
- **Generación incremental**: No regenera assets que ya existen
- **Cálculo automático**: Determina cuántas imágenes generar según duración del audio
- **Cambio de estado**: Actualiza a `producir_video` cuando todo está listo
- **Integración con APIs**: Usa ElevenLabs para audio y NanoBanana para imágenes
- **Reporte de errores**: Integrado con sistema de heartbeat

## Configuración

### Variables de Entorno

```bash
# Habilitar/deshabilitar el proceso
CRON_ASSETS_GENERATION_ENABLED=true

# Intervalo de ejecución en minutos
CRON_ASSETS_GENERATION_MINUTES=8

# Umbral de guiones listos para video por canal
# El proceso solo genera assets hasta alcanzar este número
UMBRAL_VIDEOS_LISTOS=5

# URL base del API (requerido)
API_BASE_URL=http://localhost:3000/api
```

### Constantes Configurables

En `src/jobs/assets-generator.js`:

```javascript
const DURACION_POR_IMAGEN = 5; // segundos que dura cada imagen
```

## Gestión de Stock

### Concepto

El proceso funciona como un sistema de **inventario just-in-time**, manteniendo un número óptimo de guiones listos para producir video sin procesar todo el backlog de una vez.

### Comportamiento

1. **Por cada canal** verifica:
   - ¿Cuántos videos hay en estado `pendiente_publicar`?
   - Se hace JOIN entre `videos.guion_id` → `guiones.id` → `guiones.canal_id`
   
2. **Si el stock es suficiente** (≥ umbral):
   - ✅ Omite ese canal
   - 📊 Reporta en logs: "Stock suficiente"
   
3. **Si el stock es insuficiente** (< umbral):
   - 🎯 Calcula cuántos guiones faltan para alcanzar el umbral
   - ⚙️ Procesa SOLO esa cantidad de guiones
   - 🛑 Detiene procesamiento cuando alcanza el umbral

### Ejemplo de Comportamiento

**Escenario**: Canal con `UMBRAL_VIDEOS_LISTOS=5`

| Estado Actual | Stock Actual | Acción | Guiones a Procesar |
|---------------|--------------|--------|--------------------|
| 2 videos `pendiente_publicar` | 2/5 | Procesar | **3 guiones** |
| 5 videos `pendiente_publicar` | 5/5 | Omitir | **0 guiones** |
| 0 videos `pendiente_publicar` | 0/5 | Procesar | **5 guiones** |

**Ventajas**:
- 🚀 No sobrecarga APIs con llamadas innecesarias
- 💰 Optimiza costos de generación de assets
- ⚡ Pipeline siempre tiene contenido listo
- 🎯 Procesa solo lo necesario

## Flujo del Proceso

```
┌─────────────────────────────────────────┐
│ 1. Obtener guiones estado='generado'    │
│    - Sin video asociado (cruce con     │
│      tabla videos)                      │
│    - Aplicar filtros de canales         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 2. Agrupar guiones por canal            │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 3. Para cada canal:                     │
│    - Contar videos en 'pendiente_       │
│      publicar' (JOIN con guiones)       │
│    - ¿Stock >= UMBRAL_VIDEOS_LISTOS?    │
└──────────────┬──────────────────────────┘
               │
         ┌─────┴─────┐
         │           │
        Sí          No
         │           │
         ▼           ▼
  ┌──────────┐  ┌──────────────────────┐
  │ Omitir   │  │ Calcular faltantes:  │
  │ canal    │  │ = UMBRAL - stock     │
  └──────────┘  └──────┬───────────────┘
                       │
                       ▼
               ┌──────────────────────┐
               │ 4. Procesar solo N   │
               │    guiones faltantes │
               └──────┬───────────────┘
                      │
                      ▼
               ┌──────────────────────┐
               │ 5. Para cada guión:  │
               │ - Verificar assets   │
               └──────┬───────────────┘
                      │
                      ▼
                ┌─────────┐
                │ ¿Tiene  │ ── No ──┐
                │ audio?  │         │
                └────┬────┘         │
                     │ Sí           ▼
                     │    ┌──────────────────────┐
                     │    │ 6. Generar Audio     │
                     │    │ POST /api/elevenlabs/│
                     │    │      generate-narration│
                     │    └──────────┬───────────┘
                     │               │
                     └───────────────┘
                                     ▼
               ┌─────────────────────────────────────────┐
               │ 7. Calcular imágenes necesarias         │
               │    cantidad = ceil(duracion / 5)        │
               └──────────────┬──────────────────────────┘
                              │
                              ▼
               ┌─────────────────────────────────────────┐
               │ 8. Para cada escena:                    │
               │    - Verificar si ya existe             │
               │    - Obtener datos del storyboard       │
               │    - Generar imagen si falta            │
               │    POST /api/nanobanana/generate-image  │
               └──────────────┬──────────────────────────┘
                              │
                              ▼
                        ┌─────────┐
                        │ ¿Todos  │ ── No ──► Mantener 'generado'
                        │completos?│
                        └────┬────┘
                             │ Sí
                             ▼
               ┌─────────────────────────────────────────┐
               │ 9. Cambiar estado a 'producir_video'    │
               └──────────────┬──────────────────────────┘
                              │
                              ▼
                        ┌─────────┐
                        │ ¿Stock  │ ── Sí ──► Pasar al siguiente
                        │alcanzado?│           canal
                        └────┬────┘
                             │ No
                             │
                             └────► Continuar con
                                    siguiente guión
```

## Lógica de Cálculo de Imágenes

### Fórmula

```javascript
cantidadImagenes = Math.ceil(duracionAudioSegundos / DURACION_POR_IMAGEN)
```

### Ejemplos

| Duración Audio | Cálculo | Imágenes Generadas |
|----------------|---------|-------------------|
| 15 segundos | 15 ÷ 5 = 3 | **3 imágenes** |
| 24 segundos | 24 ÷ 5 = 4.8 → ceil = 5 | **5 imágenes** |
| 30 segundos | 30 ÷ 5 = 6 | **6 imágenes** |
| 33 segundos | 33 ÷ 5 = 6.6 → ceil = 7 | **7 imágenes** |

### ¿Por qué 5 segundos por imagen?

Esta duración proporciona:
- ✅ Ritmo dinámico sin ser frenético
- ✅ Tiempo suficiente para comprender la imagen
- ✅ Transiciones suaves entre escenas
- ✅ Balance entre cantidad de imágenes y costo de generación

## Estructura del Guión JSON

El proceso lee los datos del campo `guion_detallado_json` de la tabla `guiones`:

### Campos Utilizados

```json
{
  "narracion": {
    "texto": "¿Sabías que el Camino Real...",
    "tiempo_inicio": 0,
    "tiempo_fin": 30
  },
  "storyboard": [
    {
      "escena": 1,
      "duracion": 5,
      "tiempo_inicio": 0,
      "tiempo_fin": 5,
      "descripcion_imagen": "Plano aéreo cinematográfico al atardecer...",
      "prompt_imagen": "Cinematic wide aerial at golden hour..."
    },
    {
      "escena": 2,
      "duracion": 5,
      "tiempo_inicio": 5,
      "tiempo_fin": 10,
      "descripcion_imagen": "Recreación histórica en primer plano...",
      "prompt_imagen": "Close up historical reenactor..."
    }
  ]
}
```

### Campos Importantes

- **`narracion.texto`**: Texto para generar el audio con ElevenLabs
- **`narracion.tiempo_fin`**: Duración total del audio (usado si no se obtiene del API)
- **`storyboard[].escena`**: Número de escena (1, 2, 3...)
- **`storyboard[].descripcion_imagen`**: Descripción de la imagen (fallback)
- **`storyboard[].prompt_imagen`**: Prompt optimizado para la IA (preferido)

## Endpoints Utilizados

### 1. Generar Narración (ElevenLabs)

```http
POST /api/elevenlabs/generate-narration
Content-Type: application/json

{
  "guion_id": "uuid-del-guion",
  "texto": "¿Sabías que el Camino Real de Tierra Adentro..."
}
```

**Respuesta esperada:**
```json
{
  "success": true,
  "audio": {
    "url": "https://storage.supabase.co/.../audio.mp3",
    "size_bytes": 245678,
    "duration_seconds": 24.5
  }
}
```

### 2. Generar Imagen (NanoBanana)

```http
POST /api/nanobanana/generate-image
Content-Type: application/json

{
  "guion_id": "uuid-del-guion",
  "escena": 1,
  "prompt": "Cinematic wide aerial at golden hour..."
}
```

**Respuesta esperada:**
```json
{
  "success": true,
  "asset": {
    "url": "https://storage.supabase.co/.../imagen1.jpg",
    "metadata": {
      "size_bytes": 512000,
      "width": 1920,
      "height": 1080
    }
  }
}
```

## Requisitos de Base de Datos

### Tabla `guiones`

```sql
guiones (
  id uuid PRIMARY KEY,
  canal_id uuid REFERENCES canales(id),
  nombre text NOT NULL,
  estado text,  -- 'generado', 'producir_video', 'procesando', etc.
  guion_detallado_json jsonb,  -- Contiene narracion y storyboard
  created_at timestamp with time zone DEFAULT now()
)
```

### Tabla `videos`

```sql
videos (
  id uuid PRIMARY KEY,
  guion_id uuid REFERENCES guiones(id),
  canal_id uuid REFERENCES canales(id),
  url_video text,
  duracion integer,
  estado text,
  created_at timestamp with time zone DEFAULT now()
)
```

### Tabla `media_assets`

```sql
media_assets (
  id uuid PRIMARY KEY,
  guion_id uuid REFERENCES guiones(id),
  seccion_id uuid REFERENCES secciones_guion(id),
  tipo text,  -- 'audio', 'imagen', 'video'
  storage_path text NOT NULL,
  url text,
  metadata jsonb DEFAULT '{}',  -- Puede contener { escena: 1, seccion: 'intro' }
  created_at timestamp with time zone DEFAULT now()
)
```

## Control de Concurrencia

```javascript
let isGeneratingAssets = false;

async function generarAssets() {
  if (isGeneratingAssets) {
    console.log('⏸️  Generación de assets ya en progreso, omitiendo...');
    return;
  }
  
  isGeneratingAssets = true;
  
  try {
    // ... proceso ...
  } finally {
    isGeneratingAssets = false;
  }
}
```

## Estados de los Guiones

```
generado
  │
  ├─ Generar audio con ElevenLabs
  ├─ Calcular cantidad de imágenes necesarias
  ├─ Generar imágenes con NanoBanana
  │
  ▼
producir_video  (cuando todos los assets están completos)
  │
  └─ Listo para que el generador de videos lo procese
```

## Logs y Monitoreo

```
================================================================================
🎬 GENERACIÓN DE ASSETS (AUDIO E IMÁGENES)
⏰ Timestamp: 2024-01-15T10:30:00.000Z
================================================================================

📋 Guiones a procesar: 3

────────────────────────────────────────────────────────────────────────────────

📺 Canal: Legado de papel
   Guión: Camino Real de Tierra Adentro
   ID: abc-123-def-456

   🎙️  Generando narración con ElevenLabs...
   ✅ Narración generada: https://storage.supabase.co/.../audio.mp3
   📦 Tamaño: 240.12 KB
   ⏱️  Duración: 24.5s

   📊 Duración audio: 24.5s → 5 imágenes necesarias

   🎨 Generando imagen para escena 1...
   ✅ Imagen 1 generada: https://storage.supabase.co/.../img1.jpg
   📦 Tamaño: 500.45 KB

   🎨 Generando imagen para escena 2...
   ✅ Imagen 2 generada: https://storage.supabase.co/.../img2.jpg
   📦 Tamaño: 485.23 KB

   🎨 Generando imagen para escena 3...
   ✅ Imagen 3 generada: https://storage.supabase.co/.../img3.jpg
   📦 Tamaño: 502.18 KB

   🎨 Generando imagen para escena 4...
   ✅ Imagen 4 generada: https://storage.supabase.co/.../img4.jpg
   📦 Tamaño: 495.67 KB

   🎨 Generando imagen para escena 5...
   ✅ Imagen 5 generada: https://storage.supabase.co/.../img5.jpg
   📦 Tamaño: 510.89 KB

   📈 Resumen:
      • Audio: ✅
      • Imágenes: 5/5
      • Errores: 0
   ✅ Estado cambiado a 'producir_video'

────────────────────────────────────────────────────────────────────────────────

📺 Canal: Mami Chula
   Guión: Historias de Infidelidad
   ID: ghi-789-jkl-012

   ✅ Audio ya existe
   📊 Duración audio: 30s → 6 imágenes necesarias

   ✅ Imagen 1 ya existe
   ✅ Imagen 2 ya existe
   ✅ Imagen 3 ya existe

   🎨 Generando imagen para escena 4...
   ✅ Imagen 4 generada: https://storage.supabase.co/.../img4.jpg
   📦 Tamaño: 488.34 KB

   🎨 Generando imagen para escena 5...
   ❌ Error generando imagen 5: Timeout error

   🎨 Generando imagen para escena 6...
   ✅ Imagen 6 generada: https://storage.supabase.co/.../img6.jpg
   📦 Tamaño: 492.56 KB

   📈 Resumen:
      • Audio: ✅
      • Imágenes: 5/6
      • Errores: 1
   ⚠️  Assets incompletos, manteniendo estado 'generado'

================================================================================
✅ GENERACIÓN DE ASSETS COMPLETADA
   Guiones procesados: 3
   Completados (→ producir_video): 1
   Con errores: 0
   Pendientes: 2
================================================================================
```

## Integración con Heartbeat

El proceso reporta errores al sistema de heartbeat:

```javascript
await reportarError({
  tipo: TipoError.PROCESSING,
  severidad: Severidad.ERROR,
  mensaje: `Error al generar audio para guión ${guion.nombre}`,
  error: error,
  canalId: guion.canal_id,
  contexto: {
    guion_id: guion.id,
    guion_nombre: guion.nombre
  }
});
```

## Casos Especiales

### Guión sin estructura JSON válida

```
❌ Guión sin estructura JSON válida
```

Si `guion_detallado_json` no tiene las propiedades `narracion` o `storyboard`, se omite el guión.

### Audio ya generado

```
✅ Audio ya existe
```

El sistema verifica en la tabla `media_assets` si ya existe un registro con `tipo='audio'` para ese guión.

### Imagen ya generada

```
✅ Imagen 3 ya existe
```

Solo genera imágenes que no existen en la tabla `media_assets`.

### Escena sin descripción en storyboard

```
⚠️  No hay datos de storyboard para escena 7, omitiendo...
```

Si el storyboard no tiene suficientes escenas, se omiten las faltantes.

### Error generando imagen

```
❌ Error generando imagen 4: API timeout
```

Los errores individuales no detienen el proceso, se continúa con las siguientes imágenes.

## Troubleshooting

### Error: "API_BASE_URL no configurado"

**Solución:** Define la variable en `.env`:
```bash
API_BASE_URL=http://localhost:3000/api
```

### Error: "Guión sin texto de narración"

**Solución:** Verifica que `guion_detallado_json.narracion.texto` exista y tenga contenido.

### Las imágenes no se generan correctamente

**Verificar:**
1. El storyboard tiene suficientes escenas
2. Cada escena tiene `descripcion_imagen` o `prompt_imagen`
3. El endpoint `/api/nanobanana/generate-image` está funcionando
4. Hay suficientes créditos/cuota en NanoBanana

### El estado no cambia a 'producir_video'

**Posibles causas:**
- Faltan imágenes por generar
- El audio no se generó correctamente
- Hubo errores en la generación de assets

**Verificar tabla `media_assets`:**
```sql
SELECT tipo, metadata->>'escena' as escena, url 
FROM media_assets 
WHERE guion_id = 'uuid-del-guion'
ORDER BY tipo, metadata->>'escena';
```

## Mantenimiento

### Ajustar duración por imagen

Modifica en `src/jobs/assets-generator.js`:
```javascript
const DURACION_POR_IMAGEN = 3; // Cambiar de 5 a 3 segundos
```

### Cambiar la frecuencia

Modifica en `.env`:
```bash
CRON_ASSETS_GENERATION_MINUTES=10  # Cada 10 minutos en lugar de 8
```

### Deshabilitar temporalmente

```bash
CRON_ASSETS_GENERATION_ENABLED=false
```

## Testing

Para probar manualmente el proceso:

```javascript
const { generarAssets } = require('./src/jobs/assets-generator');

// Ejecutar una vez
generarAssets()
  .then(() => console.log('Proceso completado'))
  .catch(err => console.error('Error:', err));
```

## Métricas

El proceso proporciona métricas útiles:
- Guiones procesados
- Guiones completados (cambiados a `producir_video`)
- Guiones con errores
- Guiones pendientes (assets incompletos)

Estas métricas ayudan a monitorear la salud del pipeline de producción y detectar problemas en la generación de assets.

## Optimizaciones Futuras

### Generación Paralela de Imágenes

Actualmente las imágenes se generan secuencialmente. Se podría implementar generación en paralelo con un límite de concurrencia:

```javascript
// Generar hasta 3 imágenes simultáneamente
const CONCURRENCIA_IMAGENES = 3;
```

### Cache de Prompts Similares

Si dos escenas tienen prompts muy similares, se podría reutilizar la imagen:

```javascript
// Detectar similitud > 90% y reutilizar
if (similitud(prompt1, prompt2) > 0.9) {
  reutilizarImagen(escena1, escena2);
}
```

### Reintentos Automáticos

Implementar reintentos con backoff exponencial para errores temporales:

```javascript
const MAX_REINTENTOS = 3;
const DELAY_BASE = 5000; // 5 segundos
```
