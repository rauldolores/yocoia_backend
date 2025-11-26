# Configuración de Filtrado de Canales

El sistema ahora soporta filtrado de canales para todos los procesos automatizados mediante el archivo `src/config/channel-filter.json`.

## Estructura del Archivo

```json
{
  "enabled": true,
  "channels": {
    "ids": [],
    "names": []
  }
}
```

## Configuración

### Campos

- **`enabled`** (boolean): Activa o desactiva el filtrado de canales
  - `true`: Solo procesa los canales especificados
  - `false`: Procesa todos los canales (comportamiento predeterminado)

- **`channels.ids`** (array): Lista de IDs de canales a procesar
  - Ejemplo: `["uuid-canal-1", "uuid-canal-2"]`
  - Array vacío `[]` = no filtrar por IDs

- **`channels.names`** (array): Lista de nombres de canales a procesar
  - Ejemplo: `["Canal Principal", "Canal Secundario"]`
  - Array vacío `[]` = no filtrar por nombres

## Ejemplos de Uso

### Procesar todos los canales (predeterminado)

```json
{
  "enabled": false,
  "channels": {
    "ids": [],
    "names": []
  }
}
```

### Filtrar por IDs de canal

```json
{
  "enabled": true,
  "channels": {
    "ids": ["123e4567-e89b-12d3-a456-426614174000", "987fcdeb-51a2-43f1-b234-56789abcdef0"],
    "names": []
  }
}
```

### Filtrar por nombres de canal

```json
{
  "enabled": true,
  "channels": {
    "ids": [],
    "names": ["Datos Curiosos", "Historia Fascinante"]
  }
}
```

### Filtrar por IDs Y nombres (ambos se aplican)

```json
{
  "enabled": true,
  "channels": {
    "ids": ["123e4567-e89b-12d3-a456-426614174000"],
    "names": ["Canal Especial"]
  }
}
```

## Procesos Afectados

El filtrado aplica a **TODOS** los procesos automatizados:

1. **Generación de videos** (`video-generator.js`)
   - Solo genera videos de guiones de los canales especificados

2. **Programación de publicaciones** (`scheduler.js`)
   - Solo programa videos de los canales especificados

3. **Publicación en redes sociales** (`publisher.js`)
   - Solo publica videos de los canales especificados

4. **Generación de guiones** (`guion-generator.js`)
   - Solo genera guiones desde ideas de los canales especificados

## Comportamiento

- ✅ Si `enabled: false` → Procesa **todos** los canales
- ✅ Si `enabled: true` y ambos arrays vacíos → Procesa **todos** los canales
- ✅ Si hay IDs especificados → Filtra por esos IDs
- ✅ Si hay nombres especificados → Filtra por esos nombres
- ✅ Si ambos están especificados → Debe cumplir **AMBAS** condiciones (AND lógico)

## Recarga de Configuración

Para que los cambios surtan efecto:

1. Edita `src/config/channel-filter.json`
2. Reinicia el servidor con `node start.js`

La configuración se carga al iniciar el sistema y permanece en memoria durante la ejecución.

## Obtener IDs de Canales

Puedes consultar los IDs de tus canales en Supabase:

```sql
SELECT id, nombre FROM canales ORDER BY nombre;
```

## Notas Importantes

- ⚠️ Los filtros se aplican de forma **global** a todos los procesos cron
- ⚠️ No es posible configurar diferentes filtros por proceso individual
- ⚠️ Si un archivo `channel-filter.json` tiene errores de sintaxis, el sistema procesará todos los canales por defecto
- ✅ Los mensajes de consola indicarán cuántos registros se procesaron después del filtrado
