# Configuración de Cron Jobs y Filtrado de Canales

## Variables de Entorno

### Filtrado de Canales

Las variables de filtrado de canales permiten especificar qué canales serán procesados por el sistema.

#### `FILTER_CHANNEL_IDS`
Lista de IDs de canales separados por comas.
```env
# Ejemplo: Procesar solo 3 canales específicos por ID
FILTER_CHANNEL_IDS=abc-123-def,ghi-456-jkl,mno-789-pqr

# Dejar vacío para no filtrar por IDs
FILTER_CHANNEL_IDS=
```

#### `FILTER_CHANNEL_NAMES`
Lista de nombres de canales separados por comas.
```env
# Ejemplo: Procesar solo canales específicos por nombre
FILTER_CHANNEL_NAMES=Canal Principal,Canal Secundario,Canal de Noticias

# Dejar vacío para no filtrar por nombres
FILTER_CHANNEL_NAMES=
```

**Comportamiento:**
- Si ambas variables están vacías → se procesan **TODOS** los canales
- Si se especifica cualquiera → solo se procesan los canales que cumplan los criterios
- Se puede usar IDs, nombres, o ambos simultáneamente

**⚠️ IMPORTANTE:** El filtro de canales se aplica SOLO a:
- ✅ Programación de publicaciones
- ✅ Publicación en redes sociales

**NO se aplica a:**
- ❌ Generación de videos (siempre procesa TODOS los canales)
- ❌ Generación de guiones

---

### Configuración de Cron Jobs

Cada cron job tiene dos variables: una para habilitarlo/deshabilitarlo y otra para la periodicidad en minutos.

#### Cron Job 1: Generación de Videos
```env
CRON_VIDEO_GENERATION_ENABLED=true
CRON_VIDEO_GENERATION_MINUTES=10
```
- **Descripción:** Genera videos desde guiones pendientes
- **⚠️ IMPORTANTE:** Procesa TODOS los canales (no respeta el filtro)
- **Recomendación:** 10-15 minutos

#### Cron Job 2: Programación de Publicaciones
```env
CRON_PUBLICATION_SCHEDULING_ENABLED=true
CRON_PUBLICATION_SCHEDULING_MINUTES=5
```
- **Descripción:** Asigna fechas/horas de publicación a videos listos
- **Recomendación:** 5-10 minutos

#### Cron Job 3: Publicación en Redes Sociales
```env
CRON_SOCIAL_PUBLISHING_ENABLED=true
CRON_SOCIAL_PUBLISHING_MINUTES=2
```
- **Descripción:** Publica videos programados en YouTube y Facebook
- **Recomendación:** 1-3 minutos (para publicación oportuna)

#### Cron Job 4: Generación de Guiones
```env
CRON_SCRIPT_GENERATION_ENABLED=true
CRON_SCRIPT_GENERATION_MINUTES=7
```
- **Descripción:** Genera guiones desde ideas pendientes
- **Recomendación:** 5-10 minutos

---

## Ejemplos de Configuración

### Configuración 1: Producción Completa
Todos los cron jobs activos, procesando todos los canales:
```env
FILTER_CHANNEL_IDS=
FILTER_CHANNEL_NAMES=

CRON_VIDEO_GENERATION_ENABLED=true
CRON_VIDEO_GENERATION_MINUTES=10
CRON_PUBLICATION_SCHEDULING_ENABLED=true
CRON_PUBLICATION_SCHEDULING_MINUTES=5
CRON_SOCIAL_PUBLISHING_ENABLED=true
CRON_SOCIAL_PUBLISHING_MINUTES=2
CRON_SCRIPT_GENERATION_ENABLED=true
CRON_SCRIPT_GENERATION_MINUTES=7
```

### Configuración 2: Solo Publicación
Solo el proceso de publicación activo, para un canal específico:
```env
FILTER_CHANNEL_IDS=
FILTER_CHANNEL_NAMES=Canal Principal

CRON_VIDEO_GENERATION_ENABLED=false
CRON_VIDEO_GENERATION_MINUTES=10
CRON_PUBLICATION_SCHEDULING_ENABLED=false
CRON_PUBLICATION_SCHEDULING_MINUTES=5
CRON_SOCIAL_PUBLISHING_ENABLED=true
CRON_SOCIAL_PUBLISHING_MINUTES=2
CRON_SCRIPT_GENERATION_ENABLED=false
CRON_SCRIPT_GENERATION_MINUTES=7
```

### Configuración 3: Testing/Desarrollo
Frecuencias más rápidas para pruebas:
```env
FILTER_CHANNEL_IDS=canal-test-123
FILTER_CHANNEL_NAMES=

CRON_VIDEO_GENERATION_ENABLED=true
CRON_VIDEO_GENERATION_MINUTES=1
CRON_PUBLICATION_SCHEDULING_ENABLED=true
CRON_PUBLICATION_SCHEDULING_MINUTES=1
CRON_SOCIAL_PUBLISHING_ENABLED=true
CRON_SOCIAL_PUBLISHING_MINUTES=1
CRON_SCRIPT_GENERATION_ENABLED=false
CRON_SCRIPT_GENERATION_MINUTES=7
```

### Configuración 4: Solo Generación de Contenido
Generar videos y guiones, sin publicar:
```env
FILTER_CHANNEL_IDS=
FILTER_CHANNEL_NAMES=

CRON_VIDEO_GENERATION_ENABLED=true
CRON_VIDEO_GENERATION_MINUTES=5
CRON_PUBLICATION_SCHEDULING_ENABLED=false
CRON_PUBLICATION_SCHEDULING_MINUTES=5
CRON_SOCIAL_PUBLISHING_ENABLED=false
CRON_SOCIAL_PUBLISHING_MINUTES=2
CRON_SCRIPT_GENERATION_ENABLED=true
CRON_SCRIPT_GENERATION_MINUTES=5
```

---

## Salida de Consola

Al iniciar el sistema, verás:

```
================================================================================
📺 CONFIGURACIÓN DE CANALES
================================================================================
🔍 Filtro de canales ACTIVO:

   📝 Por nombres:
      - Canal Principal
      - Canal Secundario

   ✅ Canales encontrados:
      • Canal Principal (abc-123-def)
      • Canal Secundario (ghi-456-jkl)

================================================================================

🚀 Iniciando servicios automatizados...
⌨️  Presiona Ctrl+C para detener los servicios

✅ Cron job 1: Generación de videos (cada 10 minutos)
✅ Cron job 2: Programación de publicaciones (cada 5 minutos)
✅ Cron job 3: Publicación en redes sociales (cada 2 minutos)
⏸️  Cron job: Generación de guiones desde ideas (DESHABILITADO)

✅ 3 cron job(s) activo(s)
⏳ Esperando próximas ejecuciones...
```

---

## Notas Importantes

1. **Periodicidad mínima:** El cron de node.js no soporta intervalos menores a 1 minuto
2. **Cambios en .env:** Requieren reiniciar el servidor (`node src/index.js`)
3. **Sin filtro = Todos los canales:** Si no especificas filtros, se procesan todos
4. **IDs vs Nombres:** Puedes usar ambos filtros simultáneamente
5. **Deshabilitación total:** Si todos los crons están deshabilitados, verás una advertencia
