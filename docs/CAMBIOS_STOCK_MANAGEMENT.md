# Cambios: Sistema de Gestión de Stock

## Resumen

Se implementó un **sistema de gestión de stock** en el proceso de generación de assets para mantener un pipeline eficiente sin procesar todos los guiones disponibles de una vez.

## Problema Identificado

### Comportamiento Anterior
- El proceso generaba assets para **TODOS** los guiones en estado `generado`
- Si había ~25 guiones, los procesaba todos simultáneamente
- Cambiaba el estado de todos a `producir_video` al completarse
- Consumía recursos innecesarios de APIs (ElevenLabs, NanoBanana)
- No había control sobre cuántos videos estaban en el pipeline

### Consecuencias
- Sobrecarga de llamadas a APIs
- Costos elevados de generación
- Pipeline saturado con contenido que no se necesitaba inmediatamente
- Falta de control sobre la producción

## Solución Implementada

### Sistema de Stock por Canal

El proceso ahora mantiene un **umbral configurable** de guiones listos para producir video, procesando solo lo necesario para mantener ese stock.

### Funcionamiento

```
Para cada canal:
1. Contar videos en estado 'pendiente_publicar'
   (JOIN: videos.guion_id → guiones.id → guiones.canal_id)
2. ¿Stock >= UMBRAL_VIDEOS_LISTOS?
   - SÍ → Omitir canal (stock suficiente)
   - NO → Procesar solo (UMBRAL - stock_actual) guiones
3. Después de procesar cada guión, verificar stock nuevamente
4. Si se alcanza el umbral, pasar al siguiente canal
```

### Ejemplo Práctico

**Canal: Legado de Papel**
- Umbral configurado: 5 videos listos
- Stock actual: 2 videos en `pendiente_publicar`
- Guiones disponibles en `generado`: 25

**Acción:**
- Calcula: 5 - 2 = 3 guiones faltantes
- Procesa **solo 3 guiones** (no los 25)
- Cuando completa el 3er guión, stock = 5
- **Detiene procesamiento** para ese canal
- Los 22 guiones restantes permanecen en estado `generado`

**Próxima ejecución (8 minutos después):**
- Si se consumieron guiones (producción de video), stock puede estar en 3
- Procesará 2 guiones más para volver a 5
- Ciclo continuo y controlado

## Cambios en Código

### 1. Nueva Configuración (`.env`)

```bash
# Umbral de guiones listos para video por canal
UMBRAL_VIDEOS_LISTOS=5
```

### 2. Configuración Centralizada (`src/config/index.js`)

```javascript
const UMBRAL_VIDEOS_LISTOS = parseInt(process.env.UMBRAL_VIDEOS_LISTOS) || 5;

module.exports = {
  // ... otros exports
  UMBRAL_VIDEOS_LISTOS
};
```

### 3. Nuevas Funciones (`src/jobs/assets-generator.js`)

```javascript
/**
 * Contar videos pendientes de publicar por canal
 * El stock se mide por videos en estado 'pendiente_publicar', no por guiones
 */
async function contarVideosListos(canalId) {
  // Primero obtener IDs de guiones del canal
  const { data: guiones, error: errorGuiones } = await supabase
    .from('guiones')
    .select('id')
    .eq('canal_id', canalId);

  if (errorGuiones) {
    throw new Error(`Error al obtener guiones del canal: ${errorGuiones.message}`);
  }

  const guionesIds = guiones?.map(g => g.id) || [];
  
  if (guionesIds.length === 0) {
    return 0;
  }

  // Contar videos en estado 'pendiente_publicar' que pertenecen a esos guiones
  const { count, error } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente_publicar')
    .in('guion_id', guionesIds);

  if (error) {
    throw new Error(`Error al contar videos pendientes: ${error.message}`);
  }

  return count || 0;
}
```

### 4. Lógica Modificada en `generarAssets()`

**Antes:**
```javascript
// Procesar TODOS los guiones
for (const guion of guiones) {
  await procesarGuion(guion);
}
```

**Después:**
```javascript
// 1. Agrupar por canal
const guionesPorCanal = {};
for (const guion of guiones) {
  const canalId = guion.canal_id;
  if (!guionesPorCanal[canalId]) {
    guionesPorCanal[canalId] = {
      nombre: guion.canales?.nombre,
      guiones: []
    };
  }
  guionesPorCanal[canalId].guiones.push(guion);
}

// 2. Procesar por canal con control de stock
for (const [canalId, canal] of Object.entries(guionesPorCanal)) {
  const videosListos = await contarVideosListos(canalId);
  
  // Si stock suficiente, omitir canal
  if (videosListos >= UMBRAL_VIDEOS_LISTOS) {
    continue;
  }

  // Calcular cuántos faltan
  const guionesNecesarios = UMBRAL_VIDEOS_LISTOS - videosListos;
  const guionesAProcesar = canal.guiones.slice(0, guionesNecesarios);

  // Procesar solo los necesarios
  for (const guion of guionesAProcesar) {
    await procesarGuion(guion);
    
    // Verificar si ya alcanzamos el stock
    const stockActual = await contarVideosListos(canalId);
    if (stockActual >= UMBRAL_VIDEOS_LISTOS) {
      break; // Pasar al siguiente canal
    }
  }
}
```

## Ventajas del Nuevo Sistema

### 1. Optimización de Recursos
- ✅ Solo genera assets cuando realmente se necesitan
- ✅ Reduce llamadas innecesarias a APIs externas
- ✅ Disminuye costos de generación (ElevenLabs, NanoBanana)

### 2. Control del Pipeline
- ✅ Cantidad predecible de contenido listo para producir
- ✅ Facilita planificación y monitoreo
- ✅ Evita saturación del proceso de generación de video

### 3. Eficiencia Operativa
- ✅ Pipeline fluye continuamente
- ✅ Siempre hay contenido disponible (stock mínimo)
- ✅ No acumula trabajo innecesario

### 4. Flexibilidad
- ✅ Umbral configurable por necesidades del negocio
- ✅ Se ajusta automáticamente a la velocidad de consumo
- ✅ Independiente por canal (cada uno maneja su propio stock)

## Logs Mejorados

### Ejemplo de Salida

```
================================================================================
🎬 GENERACIÓN DE ASSETS (AUDIO E IMÁGENES)
⏰ Timestamp: 2024-01-20T15:30:00.000Z
================================================================================

📋 Guiones disponibles para procesar: 25

📺 Canal: Legado de Papel (15 guiones disponibles)
   Stock actual: 2/5 videos pendientes de publicar
   🎯 Necesarios: 3, procesando: 3

────────────────────────────────────────────────────────────────────────────
🎬 Procesando guión: El Misterio del Camino Real
   Canal: Legado de Papel (legado-de-papel-123)
...
   ✅ Estado cambiado a 'producir_video'

────────────────────────────────────────────────────────────────────────────
🎬 Procesando guión: Leyendas de la Conquista
...
   ✅ Estado cambiado a 'producir_video'

────────────────────────────────────────────────────────────────────────────
🎬 Procesando guión: Tesoros Perdidos de México
...
   ✅ Estado cambiado a 'producir_video'

   ✅ Stock alcanzado (5/5 videos), pasando al siguiente canal

📺 Canal: Mami Chula (10 guiones disponibles)
   Stock actual: 5/5 videos pendientes de publicar
   ✅ Stock suficiente, omitiendo este canal

================================================================================
✅ GENERACIÓN DE ASSETS COMPLETADA
   Guiones procesados: 3
   Completados (→ producir_video): 3
   Con errores: 0
   Omitidos por stock suficiente: 10
   Pendientes: 0
================================================================================
```

## Configuración Recomendada

### Para Producción Alta (varios canales activos)
```bash
UMBRAL_VIDEOS_LISTOS=5
CRON_ASSETS_GENERATION_MINUTES=8
```

### Para Producción Media
```bash
UMBRAL_VIDEOS_LISTOS=3
CRON_ASSETS_GENERATION_MINUTES=10
```

### Para Desarrollo/Testing
```bash
UMBRAL_VIDEOS_LISTOS=2
CRON_ASSETS_GENERATION_MINUTES=5
```

## Verificación del Funcionamiento

### Consulta SQL para Verificar Stock

```sql
-- Ver stock actual por canal
SELECT 
  c.nombre as canal,
  COUNT(v.id) as videos_pendientes
FROM canales c
LEFT JOIN guiones g ON g.canal_id = c.id
LEFT JOIN videos v ON v.guion_id = g.id 
  AND v.estado = 'pendiente_publicar'
GROUP BY c.id, c.nombre
ORDER BY c.nombre;
```

### Monitoreo de Logs

Buscar en logs:
- `"Stock actual: X/5 videos pendientes de publicar"` - Estado de cada canal
- `"Stock suficiente, omitiendo este canal"` - Canales que no necesitan procesamiento
- `"Stock alcanzado (5/5 videos)"` - Cuando se completa el stock durante procesamiento
- `"Omitidos por stock suficiente: N"` - Total de guiones no procesados

## Compatibilidad

- ✅ Compatible con filtro de canales existente (`FILTER_CHANNEL_NAMES`)
- ✅ No afecta otros procesos del pipeline
- ✅ Cambio retrocompatible (si no se configura `UMBRAL_VIDEOS_LISTOS`, usa 5 por defecto)

## Próximos Pasos

Si en el futuro se desea afinar más:

1. **Stock dinámico por canal**: Diferentes umbrales según el canal
2. **Priorización**: Procesar primero canales con stock más bajo
3. **Predicción**: Ajustar umbral según velocidad de consumo histórica
4. **Alertas**: Notificar si un canal se queda sin stock

---

**Fecha de implementación:** Enero 2024  
**Versión:** 1.0  
**Autor:** Sistema Yocoia
