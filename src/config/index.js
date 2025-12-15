/**
 * Configuración centralizada del sistema
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const path = require('path');
const fs = require('fs');

// Configurar rutas de FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// =============================================================================
// VARIABLES DE ENTORNO
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'gbTn1bmCvNgk0QEAVyfM';

// APIs de redes sociales
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

// API de generación de guiones
const GUIONES_API_URL = process.env.GUIONES_API_URL || 'http://localhost:3000/api/guiones-cortos/generar';

// =============================================================================
// VALIDACIÓN
// =============================================================================

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERROR: Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('❌ ERROR: Falta variable de entorno OPENAI_API_KEY');
  process.exit(1);
}

if (!ELEVENLABS_API_KEY) {
  console.error('❌ ERROR: Falta variable de entorno ELEVENLABS_API_KEY');
  process.exit(1);
}

// Advertir si faltan credenciales de redes sociales
if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
  console.warn('⚠️  ADVERTENCIA: Faltan credenciales de YouTube');
  console.warn('   La publicación en YouTube estará deshabilitada');
}

if (!FACEBOOK_ACCESS_TOKEN) {
  console.warn('⚠️  ADVERTENCIA: Falta FACEBOOK_ACCESS_TOKEN');
  console.warn('   La publicación en Facebook estará deshabilitada');
}

// =============================================================================
// CLIENTES
// =============================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// =============================================================================
// DIRECTORIOS
// =============================================================================

const TEMP_DIR = path.join(__dirname, '..', '..', 'temp');
const EXPORTS_DIR = path.join(__dirname, '..', '..', 'exports');

// =============================================================================
// CONFIGURACIÓN DE VIDEO
// =============================================================================

const VIDEO_CONFIG = {
  width: 1080,
  height: 1920,
  codec: 'libx264',
  preset: 'medium',
  crf: 23,
  pixelFormat: 'yuv420p'
};

const COLOR_GRADING = {
  saturation: 1.3,
  brightness: 0.05,
  contrast: 1.1,
  vignetteIntensity: 0.3
};

const KEN_BURNS = {
  zoomStart: 1.7,
  zoomEnd: 1.0
};

const PATRONES_PAN = [
  { nombre: 'izquierda-derecha', factorX: -0.3, direccionX: 1 },
  { nombre: 'derecha-izquierda', factorX: 0.3, direccionX: -1 },
  { nombre: 'arriba-abajo', factorY: -0.3, direccionY: 1 },
  { nombre: 'abajo-arriba', factorY: 0.3, direccionY: -1 }
];

// =============================================================================
// CONFIGURACIÓN DE PROGRAMACIÓN
// =============================================================================

/**
 * Cargar horas de publicación desde variable de entorno
 * Formato: números separados por comas (ej: "9,12,15,18,21")
 */
function cargarHorasPublicacion() {
  const horasEnv = process.env.HORAS_PUBLICACION;
  
  if (!horasEnv || horasEnv.trim() === '') {
    // Valores por defecto
    return [9, 12, 15, 18, 21];
  }
  
  try {
    const horas = horasEnv.split(',').map(h => {
      const hora = parseInt(h.trim());
      if (isNaN(hora) || hora < 0 || hora > 23) {
        throw new Error(`Hora inválida: ${h}`);
      }
      return hora;
    });
    
    if (horas.length === 0) {
      console.warn('⚠️  HORAS_PUBLICACION vacío, usando valores por defecto');
      return [9, 12, 15, 18, 21];
    }
    
    return horas.sort((a, b) => a - b); // Ordenar de menor a mayor
  } catch (error) {
    console.error('❌ Error al parsear HORAS_PUBLICACION:', error.message);
    console.warn('⚠️  Usando horas por defecto: 9,12,15,18,21');
    return [9, 12, 15, 18, 21];
  }
}

const HORAS_PUBLICACION = cargarHorasPublicacion();
const MINUTOS_DESFACE_MIN = parseInt(process.env.MINUTOS_DESFACE_MIN) || 0;
const MINUTOS_DESFACE_MAX = parseInt(process.env.MINUTOS_DESFACE_MAX) || 45;
const TIMEZONE = process.env.TIMEZONE || 'America/Mexico_City';

// =============================================================================
// FILTRO DE CANALES
// =============================================================================

/**
 * Cargar configuración de filtrado de canales desde variables de entorno
 * @returns {Object} Configuración de filtrado { enabled, channels: { ids, names } }
 */
function cargarFiltroCanales() {
  const filterIds = process.env.FILTER_CHANNEL_IDS || '';
  const filterNames = process.env.FILTER_CHANNEL_NAMES || '';
  
  const ids = filterIds.trim() ? filterIds.split(',').map(id => id.trim()).filter(id => id) : [];
  const names = filterNames.trim() ? filterNames.split(',').map(name => name.trim()).filter(name => name) : [];
  
  const enabled = ids.length > 0 || names.length > 0;
  
  return {
    enabled,
    channels: { ids, names }
  };
}

const CHANNEL_FILTER = cargarFiltroCanales();

// =============================================================================
// CONFIGURACIÓN DE CRON JOBS
// =============================================================================

const CRON_CONFIG = {
  videoGeneration: {
    enabled: process.env.CRON_VIDEO_GENERATION_ENABLED === 'true',
    minutes: parseInt(process.env.CRON_VIDEO_GENERATION_MINUTES) || 10
  },
  publicationScheduling: {
    enabled: process.env.CRON_PUBLICATION_SCHEDULING_ENABLED === 'true',
    minutes: parseInt(process.env.CRON_PUBLICATION_SCHEDULING_MINUTES) || 5
  },
  socialPublishing: {
    enabled: process.env.CRON_SOCIAL_PUBLISHING_ENABLED === 'true',
    minutes: parseInt(process.env.CRON_SOCIAL_PUBLISHING_MINUTES) || 2
  },
  scriptGeneration: {
    enabled: process.env.CRON_SCRIPT_GENERATION_ENABLED === 'true',
    minutes: parseInt(process.env.CRON_SCRIPT_GENERATION_MINUTES) || 7
  },
  ideasValidation: {
    enabled: process.env.CRON_IDEAS_VALIDATION_ENABLED === 'true',
    minutes: parseInt(process.env.CRON_IDEAS_VALIDATION_MINUTES) || 5
  },
  assetsGeneration: {
    enabled: process.env.CRON_ASSETS_GENERATION_ENABLED === 'true',
    minutes: parseInt(process.env.CRON_ASSETS_GENERATION_MINUTES) || 8
  }
};

// =============================================================================
// UMBRALES DE STOCK
// =============================================================================

const UMBRAL_MINIMO_IDEAS = parseInt(process.env.UMBRAL_MINIMO_IDEAS) || 20;
const UMBRAL_MINIMO_GUIONES = parseInt(process.env.UMBRAL_MINIMO_GUIONES) || 5;
const UMBRAL_VIDEOS_LISTOS = parseInt(process.env.UMBRAL_VIDEOS_LISTOS) || 5;

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Variables de entorno
  SUPABASE_URL,
  SUPABASE_KEY,
  OPENAI_API_KEY,
  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID,
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
  YOUTUBE_REDIRECT_URI,
  FACEBOOK_ACCESS_TOKEN,
  GUIONES_API_URL,
  
  // Clientes
  supabase,
  openai,
  
  // Directorios
  TEMP_DIR,
  EXPORTS_DIR,
  
  // Configuración
  VIDEO_CONFIG,
  COLOR_GRADING,
  KEN_BURNS,
  PATRONES_PAN,
  HORAS_PUBLICACION,
  MINUTOS_DESFACE_MIN,
  MINUTOS_DESFACE_MAX,
  TIMEZONE,
  CHANNEL_FILTER,
  CRON_CONFIG,
  UMBRAL_MINIMO_IDEAS,
  UMBRAL_MINIMO_GUIONES,
  UMBRAL_VIDEOS_LISTOS,
  
  // Funciones
  cargarFiltroCanales
};
