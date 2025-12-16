# Validación y Generación Automática de Ideas

## Descripción

Este proceso automático valida periódicamente que cada canal cumpla con dos requisitos:

1. **Stock de guiones**: Mínimo 5 guiones en estado `generado` **sin video generado**
2. **Stock de ideas**: Mínimo 20 ideas sin utilizar (`utilizada = false`)

## Características

- **Filtrado automático**: Solo procesa canales con `generacion_automatica = true`
- **Solo guiones cortos**: Trabaja exclusivamente con `tipo_guion = 'corto'`
- **Ejecución periódica**: Configurable cada N minutos (default: 5 minutos)
- **No concurrente**: Usa un lock para prevenir ejecuciones simultáneas
- **Validación dual**: Verifica guiones e ideas en cada ejecución
- **Validación inteligente de guiones**: Solo cuenta guiones que no tienen video asociado
- **Auto-marcado de ideas**: Marca ideas como utilizadas cuando faltan guiones
- **Generación inteligente**: Solo genera ideas cuando el stock es insuficiente
- **Filtrado inteligente**: Solo conserva ideas con potencial viral medio o alto
- **Integración con API**: Usa los endpoints existentes de generación de ideas
- **Monitoreo por canal**: Valida cada canal activo individualmente

## Configuración

### Variables de Entorno

```bash
# Habilitar/deshabilitar el proceso
CRON_IDEAS_VALIDATION_ENABLED=true

# Intervalo de ejecución en minutos
CRON_IDEAS_VALIDATION_MINUTES=5

# URL base del API (requerido)
API_BASE_URL=http://localhost:3000/api
```

### Umbrales Configurados

Los umbrales están definidos en `src/jobs/ideas-validator.js`:

```javascript
const UMBRAL_MINIMO_GUIONES = 5;   // Mínimo de guiones en estado 'generado'
const UMBRAL_MINIMO_IDEAS = 20;     // Mínimo de ideas con utilizada=false
```

## Flujo del Proceso

```
┌─────────────────────────────────────────┐
│ 1. Obtener canales activos              │
│    - Aplicar filtros si están definidos │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 2. VALIDAR GUIONES (por cada canal)     │
│    - Contar guiones estado='generado'   │
│    - Excluir guiones con video asociado│
│    - Solo cuenta guiones sin video      │
└──────────────┬──────────────────────────┘
               │
               ▼
         ┌─────────┐
         │ < 5     │
         │guiones? │ ─────► ✅ Suficientes guiones sin video
         └────┬────┘
              │ Sí
              ▼
┌─────────────────────────────────────────┐
│ 3. Marcar ideas como utilizadas         │
│    - Cantidad = guiones faltantes       │
│    - Orden: más antiguas primero        │
│    - Actualizar utilizada=true          │
│    - Registrar utilizada_at             │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 4. VALIDAR IDEAS (por cada canal)       │
│    - Contar ideas con utilizada=false   │
└──────────────┬──────────────────────────┘
               │
               ▼
         ┌─────────┐
         │ ≥ 20    │ ─────► ✅ Suficientes ideas
         │ ideas?  │
         └────┬────┘
              │ No
              ▼
┌─────────────────────────────────────────┐
│ 5. ¿Generación automática habilitada?  │
└──────────────┬──────────────────────────┘
               │ Sí
               ▼
┌─────────────────────────────────────────┐
│ 6. Generar ideas con ChatGPT            │
│    POST /api/ideas/generar              │
│    { "intereses": canal.notas }         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 7. Filtrar ideas                        │
│    - Eliminar potencial_viral = "bajo" │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 8. Guardar en base de datos             │
│    POST /api/ideas                      │
│    { "canal_id", "ideas": [...] }       │
└─────────────────────────────────────────┘
```

## Endpoints Utilizados

### 1. Generar Ideas (ChatGPT)

```http
POST /api/ideas/generar
Content-Type: application/json

{
  "intereses": "string con los intereses del canal"
}
```

**Respuesta esperada:**
```json
{
  "success": true,
  "ideas": [
    {
      "texto": "Descripción de la idea",
      "potencial_viral": "alto|medio|bajo",
      "plataformas": ["youtube", "tiktok", "facebook"],
      "metadata": {}
    }
  ]
}
```

### 2. Guardar Ideas

```http
POST /api/ideas
Content-Type: application/json

{
  "canal_id": "uuid-del-canal",
  "ideas": [
    {
      "texto": "...",
      "potencial_viral": "medio",
      "plataformas": ["youtube"],
      "metadata": {}
    }
  ]
}
```

**Respuesta esperada:**
```json
{
  "success": true,
  "total": 25
}
```

## Requisitos de Base de Datos

### Tabla `canales`

```sql
canales (
  id uuid PRIMARY KEY,
  nombre text NOT NULL,
  notas text,  -- Intereses del canal (requerido para generar ideas)
  generacion_automatica boolean DEFAULT false,
  activo boolean DEFAULT true
)
```

### Tabla `guiones`

```sql
guiones (
  id uuid PRIMARY KEY,
  canal_id uuid REFERENCES canales(id),
  estado text,  -- 'generado', 'procesando', 'completado', etc.
  nombre text,
  contenido jsonb,
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

### Tabla `ideas`

```sql
ideas (
  id uuid PRIMARY KEY,
  canal_id uuid REFERENCES canales(id),
  texto text NOT NULL,
  plataformas text[],
  potencial_viral text,  -- 'alto', 'medio', 'bajo'
  utilizada boolean DEFAULT false,
  guion_id uuid REFERENCES guiones(id),
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  utilizada_at timestamp with time zone,  -- Registra cuándo se marcó como utilizada
  tipo_contenido text DEFAULT 'video_corto'
)
```

## Lógica de Marcado de Ideas

### ¿Cuándo se marcan ideas como utilizadas?

Cuando un canal tiene **menos de 5 guiones en estado `generado` sin video asociado**, el sistema automáticamente:

1. Obtiene todos los guiones en estado `generado` del canal
2. Cruza con la tabla `videos` para identificar cuáles ya tienen video
3. Cuenta solo los guiones que NO tienen registro en `videos.guion_id`
4. Si el conteo es menor a 5, calcula: `faltantes = 5 - guiones_sin_video`
5. Selecciona esa cantidad de ideas no utilizadas (ordenadas por fecha de creación, más antiguas primero)
6. Las marca como `utilizada = true`
7. Registra la fecha en `utilizada_at`

### ¿Por qué excluir guiones con video?

Los guiones que ya tienen un video generado están en una etapa posterior del pipeline (programación o publicación). No tiene sentido contarlos como "disponibles para generar video" porque ya fueron procesados.

### Ejemplo

**Situación inicial:**
- Canal tiene 6 guiones en estado `generado`
- 4 de esos guiones ya tienen video generado (registro en tabla `videos`)
- 2 guiones están esperando generación de video
- Canal tiene 30 ideas con `utilizada = false`

**Proceso:**
1. Detecta 6 guiones en estado `generado`
2. Cruza con tabla `videos`: 4 tienen video, 2 no tienen video
3. Cuenta solo guiones sin video: **2 guiones disponibles**
4. Detecta que faltan 3 guiones (5 - 2 = 3)
5. Selecciona las 3 ideas más antiguas
6. Las marca como `utilizada = true`
7. Ahora el generador de guiones puede procesarlas

**Propósito:**
Este mecanismo asegura que siempre haya guiones "listos para video" en el pipeline, evitando que el proceso de generación de videos se quede sin material, incluso si hay guiones en estado `generado` que ya fueron procesados.

## Control de Concurrencia

El proceso usa una variable de lock para prevenir ejecuciones simultáneas:

```javascript
let isValidatingIdeas = false;

async function validarYGenerarIdeas() {
  if (isValidatingIdeas) {
    console.log('⏸️  Validación de ideas ya en progreso, omitiendo...');
    return;
  }
  
  isValidatingIdeas = true;
  
  try {
    // ... proceso ...
  } finally {
    isValidatingIdeas = false;
  }
}
```

Esto asegura que si el cron se ejecuta cada 5 minutos, pero el proceso tarda más de 5 minutos, no se crucen ejecuciones.

## Filtrado de Potencial Viral

Solo se conservan ideas con:
- `potencial_viral = 'medio'`
- `potencial_viral = 'alto'`

Se descartan:
- `potencial_viral = 'bajo'`

```javascript
const ideasFiltradas = dataGenerar.ideas.filter(
  idea => idea.potencial_viral !== 'bajo'
);
```

## Logs y Monitoreo

El proceso genera logs detallados:

```
================================================================================
🔍 VALIDACIÓN Y GENERACIÓN DE IDEAS
⏰ Timestamp: 2024-01-15T10:30:00.000Z
================================================================================

📋 Canales a validar: 3
   • Legado de papel (abc-123)
   • Mami Chula (def-456)
   • Canal Gaming (ghi-789)

────────────────────────────────────────────────────────────────────────────────
📺 Canal: Legado de papel
   📝 Guiones generados: 3
   🎯 Umbral mínimo de guiones: 5
   ⚠️  Canal necesita más guiones (2 faltantes)
   ✅ Marcadas 2 ideas como utilizadas (más antiguas primero)
   📊 Ideas disponibles (utilizada=false): 25
   🎯 Umbral mínimo de ideas: 20
   ✅ Canal tiene suficientes ideas

────────────────────────────────────────────────────────────────────────────────
📺 Canal: Mami Chula
   📝 Guiones generados: 8
   📝 Guiones con video: 2
   📝 Guiones sin video (disponibles): 6
   🎯 Umbral mínimo de guiones: 5
   ✅ Canal tiene suficientes guiones generados
   📊 Ideas disponibles (utilizada=false): 8
   🎯 Umbral mínimo de ideas: 20
   ⚠️  Canal necesita más ideas (12 faltantes)

📝 Generando ideas para canal: Mami Chula
   Notas/Intereses: Historias de infidelidad, drama familiar, venganza
   🤖 Solicitando ideas a ChatGPT...
   ✅ ChatGPT generó 50 ideas
   🔍 Filtradas: 32 ideas (18 descartadas por bajo potencial)
   💾 Guardando ideas en la base de datos...
   ✅ Guardadas 32 ideas en la base de datos
   📈 Resumen de generación:
      • Generadas por ChatGPT: 50
      • Filtradas (medio/alto): 32
      • Guardadas en BD: 32
      • Descartadas (bajo potencial): 18

────────────────────────────────────────────────────────────────────────────────
📺 Canal: Canal Gaming
   📝 Guiones generados: 0
   🎯 Umbral mínimo de guiones: 5
   ⚠️  Canal necesita más guiones (5 faltantes)
   ✅ Marcadas 5 ideas como utilizadas (más antiguas primero)
   📊 Ideas disponibles (utilizada=false): 15
   🎯 Umbral mínimo de ideas: 20
   ⚠️  Canal necesita más ideas (5 faltantes)
   ⏸️  Generación automática deshabilitada, omitiendo...

================================================================================
✅ VALIDACIÓN COMPLETADA

📝 Guiones:
   Con guiones suficientes: 1
   Que necesitaban guiones: 2
   Total ideas marcadas (utilizada=true): 7

💡 Ideas:
   Total canales validados: 3
   Con ideas suficientes: 1
   Que necesitaban ideas: 2
   Con ideas generadas: 1
   Total ideas generadas: 32

❌ Con errores: 0
================================================================================
```

## Integración con Heartbeat

El proceso reporta errores al sistema de heartbeat:

```javascript
await reportarError({
  tipo: TipoError.API,
  severidad: Severidad.ERROR,
  mensaje: `Error al generar ideas para canal ${canal.nombre}`,
  error: error,
  canalId: canal.id,
  contexto: {
    canal_nombre: canal.nombre,
    tiene_notas: !!canal.notas
  }
});
```

## Casos Especiales

### Canal sin campo `notas`

Si un canal no tiene el campo `notas` definido, se reporta una advertencia y se omite:

```
❌ Canal sin intereses definidos en campo "notas"
```

### Canal con generación automática deshabilitada

Si `generacion_automatica = false`, se omite la generación:

```
⏸️  Generación automática deshabilitada, omitiendo...
```

### Todas las ideas con potencial bajo

Si ChatGPT genera 50 ideas pero todas son de potencial bajo, se descartarán todas:

```
⚠️  Todas las ideas fueron descartadas por bajo potencial
```

## Filtros de Canal

El proceso respeta los filtros de canal definidos en `.env`:

```bash
FILTER_CHANNEL_IDS=abc-123,def-456
FILTER_CHANNEL_NAMES=Legado de papel,Mami Chula
```

Solo validará y generará ideas para los canales especificados.

## Troubleshooting

### Error: "API_BASE_URL no configurado"

**Solución:** Define la variable en `.env`:
```bash
API_BASE_URL=http://localhost:3000/api
```

### Error: "Canal sin intereses definidos"

**Solución:** Agrega contenido al campo `notas` en la tabla `canales`:
```sql
UPDATE canales 
SET notas = 'Historias de amor, drama, reconciliación'
WHERE id = 'uuid-del-canal';
```

### Error HTTP 404 en `/api/ideas/generar`

**Solución:** Verifica que el endpoint esté implementado en el backend API.

### Las ideas no se están generando

**Verificar:**
1. `CRON_IDEAS_VALIDATION_ENABLED=true`
2. `canal.generacion_automatica = true`
3. `canal.activo = true`
4. `canal.notas` tiene contenido
5. `API_BASE_URL` está configurado

## Mantenimiento

### Ajustar umbrales

Modifica en `src/jobs/ideas-validator.js`:
```javascript
const UMBRAL_MINIMO_GUIONES = 10; // Cambiar de 5 a 10
const UMBRAL_MINIMO_IDEAS = 30;   // Cambiar de 20 a 30
```

### Cambiar la frecuencia

Modifica en `.env`:
```bash
CRON_IDEAS_VALIDATION_MINUTES=10  # Cada 10 minutos en lugar de 5
```

### Deshabilitar temporalmente

```bash
CRON_IDEAS_VALIDATION_ENABLED=false
```

## Testing

Para probar manualmente el proceso:

```javascript
const { validarYGenerarIdeas } = require('./src/jobs/ideas-validator');

// Ejecutar una vez
validarYGenerarIdeas()
  .then(() => console.log('Proceso completado'))
  .catch(err => console.error('Error:', err));
```

O usando el script de prueba:
```bash
node src/test-ideas-validator.js
```

## Métricas

El proceso proporciona métricas útiles en dos categorías:

### Métricas de Guiones
- Canales con guiones suficientes (≥5 en estado 'generado')
- Canales que necesitaban guiones (<5 en estado 'generado')
- Total de ideas marcadas como utilizadas

### Métricas de Ideas
- Canales validados
- Canales con ideas suficientes (≥20 sin utilizar)
- Canales que necesitaban ideas (<20 sin utilizar)
- Canales con ideas generadas exitosamente
- Total de ideas generadas
- Canales con errores

Estas métricas ayudan a monitorear la salud del sistema de generación de contenido y detectar cuellos de botella en el pipeline.
