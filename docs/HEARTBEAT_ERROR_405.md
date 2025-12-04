# Solución al Error HTTP 405 - Heartbeat

## ❌ Problema

Al iniciar la aplicación, aparece el error:

```
❌ Error al registrar consola: HTTP 405:
```

## 🔍 Causa

El error **HTTP 405 Method Not Allowed** indica que:

1. El endpoint `/api/consolas/registrar` **existe** en el servidor
2. Pero **no acepta** el método `POST` que estamos usando
3. O el endpoint **no está implementado correctamente**

## ✅ Soluciones

### Opción 1: Deshabilitar el Heartbeat (Temporal)

Si el servidor aún no tiene los endpoints implementados, puedes deshabilitar el heartbeat:

**En `.env`, comenta o elimina la línea:**

```env
# API_BASE_URL=http://localhost:3000/api
```

O déjala vacía:

```env
API_BASE_URL=
```

La aplicación continuará funcionando normalmente sin heartbeat.

---

### Opción 2: Implementar los Endpoints en el Servidor

El servidor debe tener estos endpoints:

#### 1. Registrar Consola

```javascript
// En tu servidor (Next.js, Express, etc.)
// Ruta: /api/consolas/registrar

app.post('/api/consolas/registrar', async (req, res) => {
  try {
    const { id, nombre, estado, sistema, ultimaActividad } = req.body;
    
    // Validar datos
    if (!id || !nombre || !estado) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: id, nombre, estado' 
      });
    }
    
    // Guardar en base de datos (Supabase, PostgreSQL, etc.)
    const { data, error } = await supabase
      .from('consolas')
      .upsert({
        id,
        nombre,
        estado,
        sistema,
        ultima_actividad: ultimaActividad,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'  // Actualizar si ya existe
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return res.status(200).json({
      success: true,
      consola: data
    });
    
  } catch (error) {
    console.error('Error al registrar consola:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});
```

#### 2. Recibir Heartbeat

```javascript
// Ruta: /api/consolas/{consoleId}/heartbeat

app.post('/api/consolas/:consoleId/heartbeat', async (req, res) => {
  try {
    const { consoleId } = req.params;
    const { estado, sistema, ultimaActividad, ultimoError, videoEnProceso } = req.body;
    
    // Actualizar en base de datos
    const { data, error } = await supabase
      .from('consolas')
      .update({
        estado,
        sistema,
        ultima_actividad: ultimaActividad,
        ultimo_error: ultimoError,
        video_en_proceso: videoEnProceso,
        updated_at: new Date().toISOString()
      })
      .eq('id', consoleId)
      .select()
      .single();
    
    if (error) throw error;
    
    return res.status(200).json({
      success: true,
      consola: data
    });
    
  } catch (error) {
    console.error('Error al procesar heartbeat:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});
```

---

### Opción 3: Crear la Tabla en la Base de Datos

Si usas Supabase o PostgreSQL, necesitas crear la tabla `consolas`:

```sql
-- Crear tabla de consolas
CREATE TABLE IF NOT EXISTS consolas (
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

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_consolas_estado 
  ON consolas(estado);

CREATE INDEX IF NOT EXISTS idx_consolas_ultima_actividad 
  ON consolas(ultima_actividad DESC);

-- RLS (Row Level Security) - opcional
ALTER TABLE consolas ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones (ajustar según tus necesidades)
CREATE POLICY "Permitir todo en consolas" 
  ON consolas 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);
```

---

## 🧪 Verificar que los Endpoints Funcionan

### Test 1: Registrar Consola

```bash
curl -X POST http://localhost:3000/api/consolas/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-123",
    "nombre": "Consola Test",
    "estado": "esperando",
    "sistema": {
      "hostname": "test",
      "platform": "win32"
    },
    "ultimaActividad": "2025-12-03T10:00:00.000Z"
  }'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "consola": { ... }
}
```

### Test 2: Enviar Heartbeat

```bash
curl -X POST http://localhost:3000/api/consolas/test-123/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "estado": "activa",
    "sistema": {
      "hostname": "test",
      "platform": "win32"
    },
    "ultimaActividad": "2025-12-03T10:05:00.000Z"
  }'
```

---

## 📝 Ejemplo Completo para Next.js

Si tu servidor es Next.js, crea estos archivos:

### `app/api/consolas/registrar/route.js`

```javascript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const body = await request.json();
    const { id, nombre, estado, sistema, ultimaActividad } = body;
    
    if (!id || !nombre || !estado) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: id, nombre, estado' },
        { status: 400 }
      );
    }
    
    const { data, error } = await supabase
      .from('consolas')
      .upsert({
        id,
        nombre,
        estado,
        sistema,
        ultima_actividad: ultimaActividad,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      consola: data
    });
    
  } catch (error) {
    console.error('Error al registrar consola:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
```

### `app/api/consolas/[consoleId]/heartbeat/route.js`

```javascript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request, { params }) {
  try {
    const { consoleId } = params;
    const body = await request.json();
    const { estado, sistema, ultimaActividad, ultimoError, videoEnProceso } = body;
    
    const { data, error } = await supabase
      .from('consolas')
      .update({
        estado,
        sistema,
        ultima_actividad: ultimaActividad,
        ultimo_error: ultimoError,
        video_en_proceso: videoEnProceso,
        updated_at: new Date().toISOString()
      })
      .eq('id', consoleId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      consola: data
    });
    
  } catch (error) {
    console.error('Error al procesar heartbeat:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
```

---

## 🔧 Debugging

### Ver logs detallados del error

Los logs ahora mostrarán:
```
❌ Error al registrar consola:
   Status: 405 Method Not Allowed
   URL: http://localhost:3000/api/consolas/registrar
   Respuesta: (sin contenido)
   ℹ️  HTTP 405 = Method Not Allowed
   ℹ️  El endpoint existe pero no acepta el método POST
   ℹ️  Verifica la implementación del endpoint en el servidor
```

### Verificar que el servidor está ejecutándose

```bash
# Verificar si el puerto 3000 está en uso
netstat -ano | findstr :3000

# O hacer una petición simple
curl http://localhost:3000/api
```

---

## ✅ Resumen

1. **Problema:** El endpoint no está implementado o no acepta POST
2. **Solución temporal:** Deshabilitar heartbeat (comentar `API_BASE_URL`)
3. **Solución definitiva:** Implementar los endpoints en el servidor
4. **Verificar:** Usar curl o Postman para probar los endpoints

Una vez implementados los endpoints correctamente, el error desaparecerá y el heartbeat funcionará normalmente.
