/**
 * Gestor de fuentes para subtítulos
 * Descarga y gestiona fuentes desde Google Fonts sin necesidad de instalación en el sistema
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Directorio donde se almacenan las fuentes
const FONTS_DIR = path.join(__dirname, '../../assets/fonts');

// Lista de fuentes disponibles con sus URLs de descarga
const FUENTES_DISPONIBLES = [
  {
    nombre: 'Arial Black',
    archivo: null, // Fuente del sistema, no necesita descarga
    usarSistema: true
  },
  {
    nombre: 'Poppins Bold',
    archivo: 'Poppins-Bold.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf'
  },
  {
    nombre: 'Montserrat Bold',
    archivo: 'Montserrat-Bold.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Bold.ttf'
  },
  {
    nombre: 'Rubik Bold',
    archivo: 'Rubik-Bold.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/rubik/Rubik-Bold.ttf'
  }
];

/**
 * Crear directorio de fuentes si no existe
 */
function crearDirectorioFuentes() {
  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
    console.log(`📁 Directorio de fuentes creado: ${FONTS_DIR}`);
  }
}

/**
 * Descargar una fuente desde URL
 * @param {string} url - URL de descarga
 * @param {string} destPath - Ruta de destino
 * @returns {Promise<void>}
 */
function descargarFuente(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Seguir redirección
        return https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
    
    file.on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Verificar y descargar fuentes faltantes
 * @returns {Promise<void>}
 */
async function verificarYDescargarFuentes() {
  crearDirectorioFuentes();
  
  console.log('\n🎨 Verificando fuentes disponibles...');
  
  for (const fuente of FUENTES_DISPONIBLES) {
    // Si es fuente del sistema, omitir
    if (fuente.usarSistema) {
      console.log(`   ✅ ${fuente.nombre} (fuente del sistema)`);
      continue;
    }
    
    const rutaFuente = path.join(FONTS_DIR, fuente.archivo);
    
    // Verificar si ya existe
    if (fs.existsSync(rutaFuente)) {
      console.log(`   ✅ ${fuente.nombre} (ya descargada)`);
      continue;
    }
    
    // Descargar fuente
    console.log(`   📥 Descargando ${fuente.nombre}...`);
    try {
      await descargarFuente(fuente.url, rutaFuente);
      console.log(`   ✅ ${fuente.nombre} descargada correctamente`);
    } catch (error) {
      console.error(`   ❌ Error al descargar ${fuente.nombre}:`, error.message);
    }
  }
  
  console.log('');
}

/**
 * Obtener una fuente aleatoria para usar en subtítulos
 * @returns {Object} - Objeto con nombre y ruta de la fuente (o null si es fuente del sistema)
 */
function obtenerFuenteAleatoria() {
  const fuentesDisponibles = FUENTES_DISPONIBLES.filter(fuente => {
    if (fuente.usarSistema) return true;
    
    const rutaFuente = path.join(FONTS_DIR, fuente.archivo);
    return fs.existsSync(rutaFuente);
  });
  
  if (fuentesDisponibles.length === 0) {
    console.warn('⚠️  No hay fuentes disponibles, usando Arial por defecto');
    return { nombre: 'Arial', archivo: null, usarSistema: true };
  }
  
  const fuenteSeleccionada = fuentesDisponibles[Math.floor(Math.random() * fuentesDisponibles.length)];
  
  return {
    nombre: fuenteSeleccionada.nombre,
    archivo: fuenteSeleccionada.archivo,
    ruta: fuenteSeleccionada.usarSistema ? null : path.join(FONTS_DIR, fuenteSeleccionada.archivo),
    usarSistema: fuenteSeleccionada.usarSistema
  };
}

module.exports = {
  verificarYDescargarFuentes,
  obtenerFuenteAleatoria,
  FONTS_DIR,
  FUENTES_DISPONIBLES
};
