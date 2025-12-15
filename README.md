# yocoia_backend

Sistema de generación y publicación automatizada de videos para redes sociales.

## Procesos Automatizados

El sistema incluye 6 procesos automatizados (cron jobs):

1. **Generación de Videos** - Procesa guiones y genera videos con FFmpeg
2. **Programación de Publicaciones** - Asigna horarios de publicación a videos listos
3. **Publicación en Redes Sociales** - Publica videos en YouTube y Facebook
4. **Generación de Guiones** - Convierte ideas en guiones estructurados
5. **Validación de Ideas** - Verifica stock de ideas y genera nuevas cuando es necesario
6. **Generación de Assets** - Genera audio e imágenes para guiones ✨ NUEVO

### Validación y Generación de Ideas

Este proceso valida periódicamente dos aspectos críticos del pipeline de producción.

**⚙️ Solo se ejecuta en canales con `generacion_automatica = true`**

**1. Stock de guiones generados (mínimo 5 por canal)**
- Si un canal tiene menos de 5 guiones en estado `generado`
- Marca automáticamente ideas como `utilizada = true`
- Cantidad marcada = guiones faltantes
- Prioriza las ideas más antiguas primero

**2. Stock de ideas disponibles (mínimo 20 por canal)**
- Si un canal tiene menos de 20 ideas sin utilizar
- Genera automáticamente nuevas ideas usando ChatGPT
- Filtra solo ideas con potencial viral medio o alto
- Descarta ideas con potencial bajo

**Configuración:**
```bash
CRON_IDEAS_VALIDATION_ENABLED=true
CRON_IDEAS_VALIDATION_MINUTES=5
```

**Documentación completa:** [docs/IDEAS_VALIDATION.md](docs/IDEAS_VALIDATION.md)

### Generación de Assets (Audio e Imágenes)

Este proceso genera los recursos multimedia necesarios para los guiones usando un **sistema de gestión de stock**.

**⚙️ Solo se ejecuta en canales con `generacion_automatica = true`**

**Sistema de Stock:**
- Mantiene un umbral configurable de guiones listos por canal (default: 5)
- Solo procesa guiones hasta alcanzar ese umbral
- Evita generar assets innecesarios cuando el stock es suficiente
- Optimiza costos de APIs y mantiene el pipeline activo

**Funcionamiento:**
- Busca guiones en estado `generado` sin video asociado
- Agrupa por canal y verifica cuántos están en `producir_video`
- Si el stock es suficiente, omite ese canal
- Si falta stock, procesa solo los guiones necesarios
- Genera narración con ElevenLabs (si no existe)
- Calcula cuántas imágenes se necesitan (5 segundos por imagen)
- Genera imágenes faltantes con IA (NanoBanana)
- Cuando todos los assets están completos, cambia el estado a `producir_video`

**Lógica de imágenes:**
- Cada imagen dura 5 segundos
- Si el audio dura 24 segundos → se generan 5 imágenes (24÷5 = 4.8, redondeado a 5)
- Usa el storyboard del guión para obtener descripciones y prompts

**Configuración:**
```bash
CRON_ASSETS_GENERATION_ENABLED=true
CRON_ASSETS_GENERATION_MINUTES=8
UMBRAL_VIDEOS_LISTOS=5  # Stock mínimo por canal
```

**Documentación completa:** [docs/ASSETS_GENERATION.md](docs/ASSETS_GENERATION.md)

## Configuración

Ver archivo `.env` para todas las variables de configuración disponibles.

## Documentación

- [Pipeline de Producción](docs/PIPELINE.md) - Visión completa del flujo de generación de contenido
- [Heartbeat System](docs/HEARTBEAT.md) - Sistema de monitoreo de consola
- [Ideas Validation](docs/IDEAS_VALIDATION.md) - Validación y generación automática de ideas
- [Assets Generation](docs/ASSETS_GENERATION.md) - Generación de audio e imágenes para guiones
