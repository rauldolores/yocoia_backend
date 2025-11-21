-- Script para agregar campos necesarios a la tabla canales
-- Ejecuta este SQL en tu base de datos Supabase

-- 1. Agregar columna credenciales si no existe
ALTER TABLE canales 
ADD COLUMN IF NOT EXISTS credenciales JSONB DEFAULT '{}'::jsonb;

-- 2. Agregar columna musica_fondo_url si no existe (para YouTube)
ALTER TABLE canales 
ADD COLUMN IF NOT EXISTS musica_fondo_url TEXT NULL;

-- 3. Agregar índice para búsquedas eficientes por credenciales
CREATE INDEX IF NOT EXISTS idx_canales_credenciales 
ON canales USING gin (credenciales);

-- 4. Agregar comentarios a las columnas
COMMENT ON COLUMN canales.credenciales IS 'Credenciales OAuth en formato JSON para YouTube/Facebook';
COMMENT ON COLUMN canales.musica_fondo_url IS 'URL del MP3 de música de fondo para videos de YouTube (opcional)';

-- 5. Verificar la estructura de la tabla
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_name = 'canales'
ORDER BY ordinal_position;

-- 6. Ejemplo de cómo se verá un registro completo de canal
-- (NO ejecutes esto, es solo un ejemplo)
/*
INSERT INTO canales (nombre, credenciales, musica_fondo_url, activo)
VALUES (
    'Mi Canal',
    '{
        "youtube": {"refresh_token": "1//0gSxxxxxxxxxxxxxxxxxx"},
        "facebook": {"page_id": "123456789", "access_token": "EAAxxxxxxxxxxxxx"}
    }'::jsonb,
    'https://tu-servidor.com/musica/fondo.mp3',
    true
);
*/

-- 7. Ejemplo de cómo actualizar credenciales de YouTube en un canal existente
-- (Reemplaza 'MI_CANAL' con el nombre real de tu canal)
/*
UPDATE canales
SET credenciales = jsonb_set(
    COALESCE(credenciales, '{}'::jsonb),
    '{youtube}',
    '{"refresh_token": "1//0gSxxxxxxxxxxxxxxxxxx"}'::jsonb
)
WHERE nombre = 'MI_CANAL';
*/

-- 8. Ejemplo para agregar credenciales de Facebook a un canal existente
/*
UPDATE canales
SET credenciales = jsonb_set(
    COALESCE(credenciales, '{}'::jsonb),
    '{facebook}',
    '{"page_id": "123456789", "access_token": "EAAxxxxxxxxxxxxx"}'::jsonb
)
WHERE nombre = 'MI_CANAL';
*/

-- 9. Ejemplo para agregar música de fondo a un canal existente
/*
UPDATE canales
SET musica_fondo_url = 'https://tu-servidor.com/musica/fondo.mp3'
WHERE nombre = 'MI_CANAL';
*/

-- 10. Consultar canales con sus credenciales
/*
SELECT 
    nombre,
    credenciales->'youtube'->>'refresh_token' as youtube_token,
    credenciales->'facebook'->>'page_id' as facebook_page,
    musica_fondo_url,
    activo
FROM canales;
*/
