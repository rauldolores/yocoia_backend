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
 * Carga la configuración de filtrado de canales desde channel-filter.json
 * @returns {Object} Configuración de filtrado { enabled, channels: { ids, names } }
 */
function cargarFiltroCanales() {
  try {
    const configPath = path.join(__dirname, 'channel-filter.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    // Validar estructura
    if (typeof config.enabled !== 'boolean') {
      console.warn('⚠️ Advertencia: channel-filter.json no tiene campo "enabled" válido. Se procesarán todos los canales.');
      return { enabled: false, channels: { ids: [], names: [] } };
    }
    
    if (!config.channels || !Array.isArray(config.channels.ids) || !Array.isArray(config.channels.names)) {
      console.warn('⚠️ Advertencia: channel-filter.json tiene estructura inválida. Se procesarán todos los canales.');
      return { enabled: false, channels: { ids: [], names: [] } };
    }
    
    return config;
  } catch (error) {
    console.warn('⚠️ Advertencia: No se pudo cargar channel-filter.json:', error.message);
    console.warn('Se procesarán todos los canales por defecto.');
    return { enabled: false, channels: { ids: [], names: [] } };
  }
}

const CHANNEL_FILTER = cargarFiltroCanales();

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
  
  // Funciones
  cargarFiltroCanales
};
