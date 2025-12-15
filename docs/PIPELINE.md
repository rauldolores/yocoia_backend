# Pipeline de Producción de Contenido

Este documento explica el flujo completo del sistema de generación de contenido, desde la idea hasta la publicación.

## Visión General del Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PIPELINE DE PRODUCCIÓN                          │
└─────────────────────────────────────────────────────────────────────┘

1. STOCK DE IDEAS (umbral: 20 sin utilizar)
   │
   │  ┌─── SI stock < 20 ────┐
   │  │                       │
   │  ├─ Generar con ChatGPT │
   │  ├─ Filtrar potencial   │ (Validador de Ideas)
   │  └─ Guardar en BD       │
   │                          │
   ▼
2. STOCK DE GUIONES (umbral: 5 en estado 'generado')
   │
   │  ┌─── SI stock < 5 ─────┐
   │  │                       │
   │  └─ Marcar ideas como   │ (Validador de Ideas)
   │     utilizada=true      │
   │                          │
   ▼
3. GENERACIÓN DE GUIONES
   │
   │  ┌─── Ideas con utilizada=true ──┐
   │  │                                │
   │  ├─ Llamar a API de guiones      │ (Generador de Guiones)
   │  ├─ Crear guión estructurado     │
   │  └─ Estado: 'generado'            │
   │                                   │
   ▼
4. GENERACIÓN DE ASSETS (NUEVO)
   │
   │  ┌─── Guiones estado='generado' ──┐
   │  │    (sin video asociado)         │
   │  ├─ Generar audio (ElevenLabs)    │ (Generador de Assets)
   │  ├─ Calcular imágenes necesarias  │
   │  ├─ Generar imágenes (NanoBanana) │
   │  └─ Estado: 'producir_video'      │
   │                                    │
   ▼
5. GENERACIÓN DE VIDEOS
   │
   │  ┌─── Guiones estado='producir_video' ─┐
   │  │                                      │
   │  ├─ Obtener assets de Supabase         │ (Generador de Videos)
   │  ├─ Renderizar con FFmpeg              │
   │  └─ Estado: 'listo_para_publicar'      │
   │                                         │
   ▼
6. PROGRAMACIÓN
   │
   │  ┌─── Videos 'listo_para_publicar' ──┐
   │  │                                    │
   │  ├─ Asignar ventana horaria          │ (Scheduler)
   │  ├─ Calcular desface aleatorio       │
   │  └─ Estado: 'programado'              │
   │                                       │
   ▼
6. PUBLICACIÓN
   │
   │  ┌─── Videos 'programado' y fecha <= ahora ──┐
   │  │                                            │
   │  ├─ Subir a YouTube                          │ (Publisher)
   │  ├─ Subir a Facebook                         │
   │  ├─ Reportar publicación (heartbeat)         │
   │  └─ Estado: 'publicado'                       │
   │                                               │
   ▼
7. MONITOREO
   │
   └─── Heartbeat + Reportes de errores/publicaciones
```

## Procesos Automatizados (Cron Jobs)

### 1. Validador de Ideas (cada 5 min)
**Archivo:** `src/jobs/ideas-validator.js`

**Función:** Mantener el stock de ideas y guiones
- Valida que haya ≥5 guiones generados por canal
- Si faltan guiones, marca ideas como utilizadas
- Valida que haya ≥20 ideas disponibles por canal
- Si faltan ideas, genera nuevas con ChatGPT

**Estado entrada:** Ideas sin utilizar
**Estado salida:** Ideas marcadas o nuevas ideas generadas

---

### 2. Generador de Guiones (cada 10 min)
**Archivo:** `src/jobs/guion-generator.js`

**Función:** Convertir ideas en guiones estructurados
- Busca ideas con `utilizada=true` y sin `guion_id`
- Llama a API para generar guión
- Vincula idea con guión generado

**Estado entrada:** Ideas con `utilizada=true`
**Estado salida:** Guiones con `estado='generado'`

---

### 3. Generador de Assets (cada 8 min) ✨ NUEVO
**Archivo:** `src/jobs/assets-generator.js`

**Función:** Generar audio e imágenes para guiones
- Busca guiones con `estado='generado'` sin video asociado
- Genera narración con ElevenLabs
- Calcula cantidad de imágenes necesarias (5s por imagen)
- Genera imágenes con NanoBanana según storyboard
- Cambia a `estado='producir_video'` cuando todo está listo

**Estado entrada:** Guiones `estado='generado'` (sin video)
**Estado salida:** Guiones `estado='producir_video'` (con todos los assets)

---

### 4. Generador de Videos (cada 10 min)
**Archivo:** `src/jobs/video-generator.js`

**Función:** Procesar guiones y generar videos
- Busca guiones con `estado='producir_video'`
- Obtiene assets (audio e imágenes) de Supabase
- Renderiza video con FFmpeg
- Sube video final a Supabase

**Estado entrada:** Guiones `estado='producir_video'`
**Estado salida:** Guiones `estado='listo_para_publicar'`

---

### 5. Programador de Publicaciones (cada 5 min)
**Archivo:** `src/jobs/scheduler.js`

**Función:** Asignar horarios de publicación
- Busca guiones `estado='listo_para_publicar'` sin fecha programada
- Calcula próxima ventana disponible por canal
- Asigna hora + desface aleatorio
- Actualiza `estado='programado'` y `fecha_programada`

**Estado entrada:** Guiones `listo_para_publicar`
**Estado salida:** Guiones `programado` con fecha

---

### 6. Publicador de Redes Sociales (cada 2 min)
**Archivo:** `src/jobs/publisher.js`

**Función:** Publicar videos en YouTube y Facebook
- Busca guiones `estado='programado'` con fecha ≤ ahora
- Descarga video de Supabase
- Sube a YouTube (si está configurado)
- Sube a Facebook (si está configurado)
- Reporta publicación exitosa al heartbeat

**Estado entrada:** Guiones `programado` (fecha alcanzada)
**Estado salida:** Guiones `publicado`

---

## Estados de los Guiones

```
generado
  │
  ├─ Assets generados (audio + imágenes)
  ▼
producir_video
  │
  ├─ Video renderizado con FFmpeg
  ▼
listo_para_publicar
  │
  ├─ Fecha de publicación asignada
  ▼
programado
  │
  ├─ Fecha alcanzada, video publicado
  ▼
publicado
```

## Estados de las Ideas

```
utilizada = false
  │
  ├─ Validador detecta que faltan guiones
  ▼
utilizada = true (sin guion_id)
  │
  ├─ Generador de guiones crea guión
  ▼
utilizada = true (con guion_id)
  │
  └─ Idea vinculada a guión
```

## Umbrales Configurables

| Recurso | Umbral | Variable | Archivo |
|---------|--------|----------|---------|
| Ideas disponibles | 20 | `UMBRAL_MINIMO_IDEAS` | `ideas-validator.js` |
| Guiones generados | 5 | `UMBRAL_MINIMO_GUIONES` | `ideas-validator.js` |
| Ideas por ejecución | 10 | `MAX_IDEAS_POR_EJECUCION` | `guion-generator.js` |

## Frecuencias de Ejecución (Default)

| Proceso | Frecuencia | Variable |
|---------|------------|----------|
| Validación de ideas | 5 min | `CRON_IDEAS_VALIDATION_MINUTES` |
| Generación de guiones | 10 min | `CRON_SCRIPT_GENERATION_MINUTES` |
| Generación de assets | 8 min | `CRON_ASSETS_GENERATION_MINUTES` |
| Generación de videos | 10 min | `CRON_VIDEO_GENERATION_MINUTES` |
| Programación | 5 min | `CRON_PUBLICATION_SCHEDULING_MINUTES` |
| Publicación | 2 min | `CRON_SOCIAL_PUBLISHING_MINUTES` |

## Control de Concurrencia

Todos los procesos implementan un sistema de lock para prevenir ejecuciones simultáneas:

```javascript
let isValidatingIdeas = false;      // ideas-validator.js
let isGeneratingGuiones = false;    // guion-generator.js
let isGeneratingAssets = false;     // assets-generator.js (NUEVO)
let isProcessingVideos = false;     // video-generator.js
let isSchedulingPublications = false; // scheduler.js
let isPublishingToSocial = false;   // publisher.js
```

Esto previene:
- Duplicación de trabajo
- Condiciones de carrera
- Uso excesivo de recursos
- Inconsistencias en base de datos

## Ejemplo de Flujo Completo

**Día 1, 00:00** - Canal "Mami Chula" tiene 8 ideas disponibles

**00:05** - Validador detecta stock bajo (< 20)
- Genera 50 ideas con ChatGPT
- Filtra 32 (medio/alto potencial)
- Descarta 18 (bajo potencial)
- Ahora: 40 ideas disponibles

**00:10** - Validador detecta 2 guiones generados (< 5)
- Marca 3 ideas más antiguas como utilizadas
- Ahora: 37 ideas disponibles, 3 ideas utilizadas

**00:15** - Generador de guiones procesa 3 ideas
- Crea 3 guiones con estado 'generado'
- Ahora: 5 guiones generados

**00:20** - Generador de assets procesa 1 guión
- Genera audio con ElevenLabs (24s)
- Calcula: necesita 5 imágenes (24÷5=4.8→5)
- Genera 5 imágenes con NanoBanana
- Estado: 'producir_video'

**00:30** - Generador de videos procesa el guión
- Obtiene audio e imágenes de Supabase
- Renderiza video con FFmpeg
- Estado: 'listo_para_publicar'

**00:35** - Scheduler asigna fecha de publicación
- Próxima ventana: hoy 9:00-9:45 AM
- Asigna: 9:23 AM (aleatorio)
- Estado: 'programado'

**09:24** - Publisher publica el video
- Sube a YouTube y Facebook
- Reporta publicación al heartbeat
- Estado: 'publicado'

**Métricas del día:**
- Ideas generadas: 32
- Ideas utilizadas: 3
- Guiones creados: 3
- Assets generados: 1 (audio + 5 imágenes)
- Videos procesados: 1
- Videos publicados: 1

## Monitoreo y Errores

El sistema reporta errores al servicio de heartbeat en:
- Fallos de generación de ideas (API)
- Errores al generar guiones (API)
- Problemas de procesamiento de video (FFmpeg)
- Fallos de subida a redes sociales (YouTube/Facebook)

También reporta publicaciones exitosas con metadata:
- Video ID
- Canal ID
- Plataforma
- URL pública
- Duración del proceso

## Resumen

El pipeline completo automatiza el proceso desde la concepción de una idea hasta su publicación en redes sociales, manteniendo stocks saludables en cada etapa y reportando métricas de rendimiento y errores para facilitar el monitoreo y debugging.
