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

const HORAS_PUBLICACION = [9, 12, 15, 18, 21];
const MINUTOS_DESFACE_MIN = 0;
const MINUTOS_DESFACE_MAX = 45;
const TIMEZONE = 'America/Mexico_City';

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
  }
};

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
  
  // Funciones
  cargarFiltroCanales
};
