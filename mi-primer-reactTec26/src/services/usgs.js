import { agregarProfundidad, filtrarSismosMexico } from '../utils/sismos.js'

// Feed público de USGS: sismos de magnitud 2.5 o más en los últimos 7 días.
// No necesita llave. Formato: GeoJSON con coordenadas [longitud, latitud, profundidad].
export const URL_SISMOS_USGS =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson'

// Con mala señal una petición puede quedarse colgada sin fallar nunca.
// Después de este tiempo se cancela y se muestra un error con "Reintentar".
const TIEMPO_LIMITE_MS = 15000

// Descarga los sismos y deja solo los de México y alrededores.
// `signal` permite cancelar la petición (por ejemplo, al cerrar la pantalla).
// Devuelve { coleccion, generadoEn }, donde generadoEn es la hora en que USGS generó el feed.
export async function obtenerSismos({ signal } = {}) {
  // Un solo controlador cancela la petición por dos motivos: quien llama lo pide o se acabó el tiempo
  const controlador = new AbortController()
  let seAcaboElTiempo = false
  const temporizador = setTimeout(() => {
    seAcaboElTiempo = true
    controlador.abort()
  }, TIEMPO_LIMITE_MS)
  const cancelarDesdeAfuera = () => controlador.abort()
  signal?.addEventListener('abort', cancelarDesdeAfuera)
  if (signal?.aborted) controlador.abort()

  try {
    const respuesta = await fetch(URL_SISMOS_USGS, { signal: controlador.signal })
    if (!respuesta.ok) {
      throw new Error(`USGS respondió ${respuesta.status}`)
    }

    let datos
    try {
      datos = await respuesta.json()
    } catch (error) {
      // Si cancelaron la petición mientras se leía, se respeta la cancelación
      if (error.name === 'AbortError') throw error
      throw new Error('Formato inesperado de USGS', { cause: error })
    }
    if (!Array.isArray(datos?.features)) {
      throw new Error('Formato inesperado de USGS')
    }

    return {
      coleccion: agregarProfundidad(filtrarSismosMexico(datos)),
      generadoEn: datos.metadata?.generated ?? null,
    }
  } catch (error) {
    if (seAcaboElTiempo) {
      throw new Error('USGS tardó demasiado en responder', { cause: error })
    }
    // fetch lanza TypeError cuando no hay red ("Failed to fetch", "Load failed"...)
    if (error instanceof TypeError) {
      throw new Error('No se pudo conectar con USGS', { cause: error })
    }
    throw error
  } finally {
    clearTimeout(temporizador)
    signal?.removeEventListener('abort', cancelarDesdeAfuera)
  }
}
