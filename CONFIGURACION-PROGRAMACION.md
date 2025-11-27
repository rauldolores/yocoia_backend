# Configuración de Ventanas de Programación

## Variables de Entorno

Las ventanas de programación ahora son completamente configurables a través de variables de entorno en el archivo `.env`.

### Variables Disponibles

```env
# Horas del día para publicar (formato 24h, separadas por comas)
HORAS_PUBLICACION=9,12,15,18,21

# Desface aleatorio en minutos
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=45

# Zona horaria
TIMEZONE=America/Mexico_City
```

## HORAS_PUBLICACION

Define las horas base del día en las que se pueden programar publicaciones.

**Formato:** Números separados por comas, en formato 24 horas (0-23)

**Ejemplos:**
```env
# Publicar 5 veces al día
HORAS_PUBLICACION=9,12,15,18,21

# Publicar 3 veces al día
HORAS_PUBLICACION=10,14,20

# Publicar cada 2 horas (12 veces al día)
HORAS_PUBLICACION=0,2,4,6,8,10,12,14,16,18,20,22

# Solo por las tardes
HORAS_PUBLICACION=14,16,18,20

# Horario laboral extendido
HORAS_PUBLICACION=8,9,10,11,12,13,14,15,16,17,18,19,20
```

**Notas:**
- Las horas se ordenan automáticamente de menor a mayor
- Valores válidos: 0-23
- Si está vacío o mal formateado, usa el default: `9,12,15,18,21`
- Cada hora representa una "ventana" de publicación

## MINUTOS_DESFACE_MIN y MINUTOS_DESFACE_MAX

Controlan el desface aleatorio que se agrega a cada hora base para evitar publicaciones exactamente en punto.

**Formato:** Números enteros de 0 a 59

**Ejemplos:**
```env
# Sin desface (publicar exactamente en punto)
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=0

# Desface de 0 a 30 minutos
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=30

# Desface de 15 a 45 minutos
MINUTOS_DESFACE_MIN=15
MINUTOS_DESFACE_MAX=45

# Publicar solo en la segunda mitad de cada hora
MINUTOS_DESFACE_MIN=30
MINUTOS_DESFACE_MAX=59
```

**Cómo funciona:**
1. Se selecciona una hora base (ej: 15)
2. Se genera un número aleatorio entre MIN y MAX (ej: 23)
3. La publicación se programa a las 15:23

**Ventajas del desface:**
- Evita patrones predecibles
- Parece más "humano"
- Mejor distribución de carga en servidores

## TIMEZONE

Define la zona horaria para todas las operaciones de programación.

**Formato:** String de zona horaria IANA

**Ejemplos:**
```env
# México
TIMEZONE=America/Mexico_City

# Buenos Aires
TIMEZONE=America/Argentina/Buenos_Aires

# España
TIMEZONE=Europe/Madrid

# Chile
TIMEZONE=America/Santiago

# Colombia
TIMEZONE=America/Bogota

# Perú
TIMEZONE=America/Lima

# UTC
TIMEZONE=UTC
```

**Lista completa:** [IANA Time Zone Database](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

## Visualización en Consola

Al iniciar el sistema, se mostrará la configuración actual:

```
================================================================================
⏰ CONFIGURACIÓN DE VENTANAS DE PROGRAMACIÓN
================================================================================
🌍 Zona horaria: America/Mexico_City
📅 Horas de publicación: 9, 12, 15, 18, 21
🎲 Desface aleatorio: 0-45 minutos

📋 Ventanas de publicación:
   • 09:00 - 09:45
   • 12:00 - 12:45
   • 15:00 - 15:45
   • 18:00 - 18:45
   • 21:00 - 21:45

================================================================================
```

## Ejemplos de Configuraciones Comunes

### Configuración Estándar (Default)
```env
HORAS_PUBLICACION=9,12,15,18,21
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=45
TIMEZONE=America/Mexico_City
```
- 5 publicaciones diarias
- Entre las 9am y 9pm
- Desface de hasta 45 minutos

### Configuración Intensiva
```env
HORAS_PUBLICACION=8,10,12,14,16,18,20,22
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=30
TIMEZONE=America/Mexico_City
```
- 8 publicaciones diarias
- Cada 2 horas
- Desface de hasta 30 minutos

### Configuración Conservadora
```env
HORAS_PUBLICACION=10,15,20
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=45
TIMEZONE=America/Mexico_City
```
- 3 publicaciones diarias
- Mañana, tarde y noche
- Desface de hasta 45 minutos

### Configuración Sin Desface (Exacto)
```env
HORAS_PUBLICACION=12,18
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=0
TIMEZONE=America/Mexico_City
```
- 2 publicaciones diarias
- Exactamente a las 12:00 y 18:00
- Sin desface aleatorio

### Configuración 24/7
```env
HORAS_PUBLICACION=0,3,6,9,12,15,18,21
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=59
TIMEZONE=America/Mexico_City
```
- 8 publicaciones diarias
- Cada 3 horas, todo el día
- Desface aleatorio en cualquier minuto de la hora

## Lógica de Programación

El sistema busca la próxima hora disponible siguiendo estas reglas:

1. **Hora actual:** Solo considera horas futuras del día actual
2. **Días futuros:** Si no hay horas disponibles hoy, busca en los próximos 7 días
3. **Una publicación por ventana:** Solo se puede programar un video por canal en cada hora base
4. **Desface aleatorio:** Se aplica automáticamente dentro del rango configurado

### Ejemplo de Flujo

Hora actual: **14:30**  
Configuración: `HORAS_PUBLICACION=9,12,15,18,21`

Videos ya programados para hoy:
- 15:23 (hora base 15)
- 18:12 (hora base 18)

**Resultado:** El siguiente video se programará a las **21:XX** (hora disponible más cercana)

## Validación de Errores

El sistema valida automáticamente las configuraciones:

```javascript
// ❌ Formato inválido
HORAS_PUBLICACION=abc,def
// Resultado: Usa default [9,12,15,18,21]

// ❌ Horas fuera de rango
HORAS_PUBLICACION=25,30,-5
// Resultado: Usa default [9,12,15,18,21]

// ⚠️ Vacío
HORAS_PUBLICACION=
// Resultado: Usa default [9,12,15,18,21]

// ✅ Válido
HORAS_PUBLICACION=10,14,18
// Resultado: [10,14,18]
```

Los errores se muestran en consola al iniciar:
```
❌ Error al parsear HORAS_PUBLICACION: Hora inválida: abc
⚠️  Usando horas por defecto: 9,12,15,18,21
```

## Recomendaciones

### Para Canales Pequeños (< 1000 suscriptores)
```env
HORAS_PUBLICACION=10,15,20
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=30
```
- 3 publicaciones diarias es suficiente
- Mantén consistencia antes de aumentar frecuencia

### Para Canales Medianos (1k-10k suscriptores)
```env
HORAS_PUBLICACION=9,12,15,18,21
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=45
```
- 5 publicaciones diarias (configuración default)
- Buen balance entre frecuencia y calidad

### Para Canales Grandes (> 10k suscriptores)
```env
HORAS_PUBLICACION=8,10,12,14,16,18,20,22
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=30
```
- Hasta 8 publicaciones diarias
- Audiencia grande puede consumir más contenido

### Para Testing
```env
HORAS_PUBLICACION=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23
MINUTOS_DESFACE_MIN=0
MINUTOS_DESFACE_MAX=5
```
- Programación cada hora (24 ventanas)
- Desface mínimo para pruebas rápidas

## Troubleshooting

### "No hay horas disponibles en los próximos 7 días"

**Causa:** Todas las ventanas de las horas configuradas están ocupadas.

**Soluciones:**
1. Agregar más horas a `HORAS_PUBLICACION`
2. Reducir la cantidad de videos programados
3. Aumentar `MINUTOS_DESFACE_MAX` (no resuelve el problema base)

### "Videos se programan muy juntos"

**Causa:** Pocas horas disponibles con muchos canales.

**Solución:** Aumentar `HORAS_PUBLICACION`
```env
# En vez de:
HORAS_PUBLICACION=10,15,20

# Usar:
HORAS_PUBLICACION=9,11,13,15,17,19,21
```

### "Quiero publicar solo en horarios específicos"

**Solución:** Define exactamente las horas deseadas
```env
# Solo almuerzo y cena
HORAS_PUBLICACION=13,20

# Solo horario laboral
HORAS_PUBLICACION=9,10,11,12,14,15,16,17,18
```

## Integración con Cron Jobs

La programación funciona en conjunto con el cron job de programación:

```env
CRON_PUBLICATION_SCHEDULING_ENABLED=true
CRON_PUBLICATION_SCHEDULING_MINUTES=5
```

El cron revisa cada 5 minutos si hay videos sin programar y busca la próxima hora disponible según la configuración de `HORAS_PUBLICACION`.

---

**Última actualización:** Noviembre 2024
