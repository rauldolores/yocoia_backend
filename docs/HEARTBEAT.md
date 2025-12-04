# Sistema de Heartbeat - Monitoreo de Consolas

## Descripción

El sistema de heartbeat permite monitorear el estado de las consolas de generación de videos en tiempo real. Cada consola envía reportes periódicos (heartbeats) al servidor central para indicar su estado actual y actividad.

## Configuración

### Variables de Entorno

Agregar al archivo `.env`:

```env
# =============================================================================
# CONFIGURACIÓN DE CONSOLA (HEARTBEAT)
# =============================================================================

# URL base del API de gestión de consolas
# En desarrollo: http://localhost:3000/api
# En producción: https://tu-dominio.com/api
API_BASE_URL=http://localhost:3000/api

# ID único de esta consola (dejar vacío para auto-generar)
# Se genera automáticamente al primer arranque si no existe
CONSOLE_ID=

# Intervalo de heartbeat en minutos (por defecto: 5)
HEARTBEAT_INTERVAL_MINUTES=5
```

## Estados de la Consola

| Estado | Descripción |
|--------|-------------|
| `activa` | Funcionando normalmente, cron jobs ejecutándose |
| `ocupada` | Procesando video actualmente |
| `esperando` | Sin trabajo, esperando nuevos videos |
| `error` | Tiene errores pero sigue funcionando |

## Funcionamiento

### 1. Registro Inicial

Al iniciar la aplicación, la consola:
- Genera o carga un ID único (UUID v4)
- Se registra en el servidor mediante `POST /api/consolas/registrar`
- Guarda el ID en archivo `.console-id` para persistencia

### 2. Heartbeats Periódicos

Cada 5 minutos (configurable), la consola envía:

```json
{
  "estado": "ocupada",
  "sistema": {
    "hostname": "mi-servidor",
    "platform": "win32",
    "arch": "x64",
    "cpus": 8,
    "totalMemory": 16,
    "freeMemory": 8,
    "uptime": 1440,
    "nodeVersion": "v18.x.x"
  },
  "ultimaActividad": "2025-12-03T10:30:00.000Z",
  "ultimoError": null,
  "videoEnProceso": "Video Historia 1 (2/5)"
}
```

### 3. Cambios de Estado Automáticos

El sistema actualiza automáticamente el estado:

- **Al iniciar**: `esperando`
- **Al procesar video**: `ocupada` + nombre del guion
- **Al completar**: `esperando`
- **En caso de error**: `error` + detalles del error

## Endpoints del API (a implementar en el servidor)

### Registrar Consola

```
POST /api/consolas/registrar
Content-Type: application/json

{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "nombre": "Consola mi-servidor",
  "estado": "esperando",
  "sistema": { ... },
  "ultimaActividad": "2025-12-03T10:00:00.000Z"
}
```

### Enviar Heartbeat

```
POST /api/consolas/{consoleId}/heartbeat
Content-Type: application/json

{
  "estado": "ocupada",
  "sistema": { ... },
  "ultimaActividad": "2025-12-03T10:30:00.000Z",
  "ultimoError": null,
  "videoEnProceso": "Video Historia 1 (2/5)"
}
```

## Uso Programático

### Cambiar Estado Manualmente

```javascript
const { EstadoConsola, cambiarEstado } = require('./services/heartbeat');

// Marcar como ocupada
cambiarEstado(EstadoConsola.OCUPADA, { 
  videoEnProceso: 'Mi video' 
});

// Marcar con error
cambiarEstado(EstadoConsola.ERROR, { 
  error: new Error('Algo salió mal') 
});

// Volver a esperando
cambiarEstado(EstadoConsola.ESPERANDO);
```

### Obtener Console ID

```javascript
const { obtenerConsoleId } = require('./services/heartbeat');

const id = obtenerConsoleId();
console.log('Console ID:', id);
```

## Estructura de Base de Datos (sugerida)

Tabla `consolas`:

```sql
CREATE TABLE consolas (
  id UUID PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  estado VARCHAR(50) NOT NULL,
  sistema JSONB,
  ultima_actividad TIMESTAMP WITH TIME ZONE,
  ultimo_error JSONB,
  video_en_proceso VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para consultas por estado
CREATE INDEX idx_consolas_estado ON consolas(estado);

-- Índice para consultas por última actividad
CREATE INDEX idx_consolas_ultima_actividad ON consolas(ultima_actividad DESC);
```

## Monitoreo

### Detectar Consolas Inactivas

Consolas que no han enviado heartbeat en más de 10 minutos:

```sql
SELECT * 
FROM consolas 
WHERE ultima_actividad < NOW() - INTERVAL '10 minutes'
  AND estado != 'inactiva';
```

### Estadísticas de Consolas

```sql
SELECT 
  estado,
  COUNT(*) as total,
  MAX(ultima_actividad) as ultima_actividad_max
FROM consolas
GROUP BY estado;
```

## Logs

El sistema genera logs informativos:

```
💓 SERVICIO DE HEARTBEAT
================================================================================
📋 Console ID: 550e8400-e29b-41d4-a716-446655440000
🌐 API Base URL: http://localhost:3000/api
⏱️  Intervalo: cada 5 minuto(s)
================================================================================

✅ Consola registrada exitosamente
✅ Servicio de heartbeat iniciado

🔄 Estado de consola: esperando → ocupada
💓 Heartbeat enviado - Estado: ocupada (Video Historia 1 (2/5))
🔄 Estado de consola: ocupada → esperando
```

## Seguridad

- El Console ID se genera localmente y se persiste en archivo `.console-id`
- No se requiere autenticación especial (agregar si es necesario)
- Se recomienda usar HTTPS en producción para `API_BASE_URL`

## Troubleshooting

### Error: "API_BASE_URL no configurado"

El heartbeat está deshabilitado. Configurar la variable en `.env`:

```env
API_BASE_URL=http://localhost:3000/api
```

### Error: "No se pudo enviar heartbeat"

Verificar que:
1. El servidor API esté ejecutándose
2. Los endpoints `/api/consolas/registrar` y `/api/consolas/{id}/heartbeat` existan
3. La red permita conexiones HTTP/HTTPS al servidor

### Console ID cambia cada vez que inicia

El archivo `.console-id` no se está persistiendo. Verificar permisos de escritura en la raíz del proyecto.

## Mejoras Futuras

- [ ] Autenticación con tokens para mayor seguridad
- [ ] Compresión de datos de sistema en heartbeats
- [ ] Métricas de rendimiento (CPU, memoria por proceso)
- [ ] Alertas cuando una consola deja de responder
- [ ] Dashboard web para visualizar estado de consolas
- [ ] Historial de actividad por consola
