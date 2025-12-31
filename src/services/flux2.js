const fetch = require('node-fetch');

/**
 * Servicio para generar imágenes con Flux 2 (fal.ai)
 */

const FAL_API_KEY = process.env.FAL_API_KEY;
const FAL_API_URL = 'https://queue.fal.run/fal-ai/flux-2';

/**
 * Verificar si el servicio está configurado
 * @returns {boolean}
 */
function isFlux2Enabled() {
  return !!FAL_API_KEY;
}

/**
 * Generar imagen con Flux 2
 * @param {string} prompt - Prompt para generar la imagen
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<string>} - URL de la imagen generada
 */
async function generateImage(prompt, options = {}) {
  if (!FAL_API_KEY) {
    throw new Error('FAL_API_KEY no está configurada en .env');
  }

  const requestData = {
    prompt: prompt,
    image_size: options.image_size || 'landscape_16_9',
    num_images: 1,
    guidance_scale: options.guidance_scale || 2.5,
    num_inference_steps: options.num_inference_steps || 28,
    enable_safety_checker: options.enable_safety_checker !== false,
    output_format: options.output_format || 'png'
  };

  console.log('      📤 Enviando solicitud a Flux 2...');

  // Enviar solicitud a la cola
  const submitResponse = await fetch(FAL_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestData)
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`Error al enviar solicitud a Flux 2: ${submitResponse.status} - ${errorText}`);
  }

  const submitData = await submitResponse.json();
  const requestId = submitData.request_id;
  console.log(`      🔄 Request ID: ${requestId}`);

  // Polling para verificar el estado
  const maxAttempts = 60; // 5 minutos máximo (5 segundos entre intentos)
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    
    // Esperar antes de verificar el estado
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log(`      ⏳ Verificando estado (intento ${attempts}/${maxAttempts})...`);

    try {
      const statusResponse = await fetch(`${FAL_API_URL}/requests/${requestId}/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`
        }
      });

      if (statusResponse.status === 404) {
        // Request aún no está listo, continuar esperando
        continue;
      }

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(`Error al verificar estado: ${statusResponse.status} - ${errorText}`);
      }

      const statusData = await statusResponse.json();
      const status = statusData.status;
      console.log(`      📊 Estado: ${status}`);

      if (status === 'COMPLETED') {
        // Obtener el resultado
        const resultResponse = await fetch(`${FAL_API_URL}/requests/${requestId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`
          }
        });

        if (!resultResponse.ok) {
          const errorText = await resultResponse.text();
          throw new Error(`Error al obtener resultado: ${resultResponse.status} - ${errorText}`);
        }

        const resultData = await resultResponse.json();
        const imageUrl = resultData.images[0].url;
        console.log('      ✅ Imagen generada exitosamente');
        return imageUrl;
      } else if (status === 'FAILED') {
        throw new Error('La generación de imagen falló en Flux 2');
      }
      // Si está IN_PROGRESS o IN_QUEUE, continuar esperando
    } catch (error) {
      if (error.message.includes('404')) {
        // Request aún no está listo, continuar esperando
        continue;
      }
      throw error;
    }
  }

  throw new Error('Timeout esperando la generación de imagen en Flux 2');
}

module.exports = {
  isFlux2Enabled,
  generateImage
};
