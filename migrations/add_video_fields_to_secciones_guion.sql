-- Migración: Agregar campos de video a secciones_guion
-- Fecha: 2025-12-17
-- Descripción: Agrega campos para almacenar la URL y storage_path del video generado por cada sección

-- Agregar campo video_url
ALTER TABLE public.secciones_guion
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Agregar campo storage_path
ALTER TABLE public.secciones_guion
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Agregar comentarios para documentación
COMMENT ON COLUMN public.secciones_guion.video_url IS 'URL pública del video generado para esta sección';
COMMENT ON COLUMN public.secciones_guion.storage_path IS 'Ruta en storage del video de la sección';
