# Resumen de Implementación - Sistema de Heartbeat

## ✅ Cambios Implementados

### 1. Variables de Entorno (`.env`)

Agregadas al final del archivo:

```env
# =============================================================================
# CONFIGURACIÓN DE CONSOLA (HEARTBEAT)
# =============================================================================

# URL base del API de gestión de consolas
API_BASE_URL=http://localhost:3000/api

# ID único de esta consola (dejar vacío para auto-generar)
CONSOLE_ID=

# Intervalo de heartbeat en minutos (por defecto: 5)
HEARTBEAT_INTERVAL_MINUTES=5
```

### 2. Nuevo Servicio de Heartbeat

**Archivo:** `src/services/heartbeat/index.js`

**Funcionalidades:**
- ✅ Generación automática de Console ID (UUID v4)
- ✅ Persistencia del ID en archivo `.console-id`
- ✅ Registro inicial de la consola en el servidor
- ✅ Envío de heartbeats periódicos (configurable)
- ✅ Reporte de información del sistema (CPU, memoria, etc.)
- ✅ Gestión de 4 estados: `activa`, `ocupada`, `esperando`, `error`
- ✅ Tracking de video en proceso y último error

**Estados:**
- `activa` - Funcionando normalmente
- `ocupada` - Procesando video actualmente
- `esperando` - Sin trabajo, esperando nuevos videos
- `error` - Tiene errores pero sigue funcionando

### 3. Integración en `src/index.js`

**Cambios:**
- ✅ Importación del servicio de heartbeat
- ✅ Inicio automático del heartbeat al arrancar la aplicación
- ✅ Cambio de estado a `activa` después de la inicialización
- ✅ Detención del heartbeat al cerrar la aplicación (SIGINT)

### 4. Integración en `src/jobs/video-generator.js`

**Cambios:**
- ✅ Importación del servicio de heartbeat
- ✅ Cambio a estado `ocupada` al procesar cada video
- ✅ Reporte del nombre del video en proceso
- ✅ Cambio a estado `error` cuando falla el procesamiento
- ✅ Cambio a estado `esperando` al completar todos los videos

### 5. Dependencias

**Instalada:**
- ✅ `uuid@^9.x.x` - Para generar IDs únicos de consola

### 6. Documentación

**Archivos creados:**
- ✅ `docs/HEARTBEAT.md` - Documentación completa del sistema
- ✅ `src/test-heartbeat.js` - Script de prueba del sistema

## 🚀 Cómo Usar

### Configuración Básica

1. **Configurar URL del API en `.env`:**
   ```env
   API_BASE_URL=http://localhost:3000/api
   ```

2. **Iniciar la aplicación:**
   ```bash
   npm start
   ```

3. **El sistema automáticamente:**
   - Genera un Console ID único (si no existe)
   - Registra la consola en el servidor
   - Envía heartbeats cada 5 minutos

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

### Probar el Sistema

```bash
node src/test-heartbeat.js
```

Este script simula cambios de estado durante 25 segundos.

## 📡 Endpoints Requeridos en el Servidor

El servidor debe implementar estos endpoints:

### 1. Registrar Consola

```
POST /api/consolas/registrar
Content-Type: application/json

Request Body:
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "nombre": "Consola mi-servidor",
  "estado": "esperando",
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
  "ultimaActividad": "2025-12-03T10:00:00.000Z"
}

Response: 200 OK
{
  "success": true,
  "consola": { ... }
}
```

### 2. Enviar Heartbeat

```
POST /api/consolas/{consoleId}/heartbeat
Content-Type: application/json

Request Body:
{
  "estado": "ocupada",
  "sistema": { ... },
  "ultimaActividad": "2025-12-03T10:30:00.000Z",
  "ultimoError": null,
  "videoEnProceso": "Video Historia 1 (2/5)"
}

Response: 200 OK
{
  "success": true,
  "consola": { ... }
}
```

## 🗄️ Base de Datos (Sugerida)

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

CREATE INDEX idx_consolas_estado ON consolas(estado);
CREATE INDEX idx_consolas_ultima_actividad ON consolas(ultima_actividad DESC);
```

## 📊 Monitoreo

### Consultar Consolas Activas

```sql
SELECT * 
FROM consolas 
WHERE ultima_actividad > NOW() - INTERVAL '10 minutes';
```

### Detectar Consolas Inactivas

```sql
SELECT * 
FROM consolas 
WHERE ultima_actividad < NOW() - INTERVAL '10 minutes'
  AND estado != 'inactiva';
```

### Estadísticas por Estado

```sql
SELECT 
  estado,
  COUNT(*) as total,
  MAX(ultima_actividad) as ultima_actividad_max
FROM consolas
GROUP BY estado;
```

## 📝 Logs Generados

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

## ⚠️ Notas Importantes

1. **Console ID:** Se genera automáticamente y se guarda en `.console-id` en la raíz del proyecto
2. **API_BASE_URL:** Si no está configurado, el heartbeat se deshabilitará silenciosamente
3. **Heartbeats silenciosos:** Solo se logean cuando el estado NO es "esperando" para reducir ruido
4. **Manejo de errores:** Si falla el envío de heartbeat, se registra en consola pero no detiene la aplicación

## 🔧 Troubleshooting

### El Console ID cambia cada vez
- Verificar permisos de escritura en la raíz del proyecto
- El archivo `.console-id` debe poder crearse y leerse

### No se envían heartbeats
- Verificar que `API_BASE_URL` esté configurado en `.env`
- Verificar que el servidor esté ejecutándose
- Revisar logs para errores de conexión

### Estado no se actualiza correctamente
- Verificar que los endpoints del servidor respondan correctamente
- Revisar logs del servidor para errores

## 🎯 Próximos Pasos

1. ✅ **Implementar endpoints en el servidor** (`/api/consolas/registrar` y `/api/consolas/{id}/heartbeat`)
2. ✅ **Crear tabla `consolas` en la base de datos**
3. ✅ **Configurar `API_BASE_URL` en producción**
4. 🔲 **Crear dashboard web para visualizar consolas**
5. 🔲 **Implementar alertas para consolas inactivas**
6. 🔲 **Agregar métricas de rendimiento por consola**

## 📚 Documentación Completa

Ver `docs/HEARTBEAT.md` para documentación detallada del sistema.
