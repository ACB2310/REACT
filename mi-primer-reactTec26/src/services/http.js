// Peticiones a las fuentes externas (USGS, NOAA, GDACS, NASA GIBS) con:
// - tiempo límite, porque con mala señal una petición puede quedarse colgada;
// - mensajes de error en español que dicen qué fuente falló.

export const TIEMPO_LIMITE_MS = 15000

// Ejecuta `tarea(senal)` cancelándola si quien llama lo pide o si se acaba el tiempo.
// Convierte los errores técnicos en mensajes claros con el nombre de la fuente.
async function conTiempoLimite({ signal, fuente, tiempoLimiteMs = TIEMPO_LIMITE_MS }, tarea) {
  const controlador = new AbortController()
  let seAcaboElTiempo = false
  const temporizador = setTimeout(() => {
    seAcaboElTiempo = true
    controlador.abort()
  }, tiempoLimiteMs)
  const cancelarDesdeAfuera = () => controlador.abort()
  signal?.addEventListener('abort', cancelarDesdeAfuera)
  if (signal?.aborted) controlador.abort()

  try {
    return await tarea(controlador.signal)
  } catch (error) {
    if (seAcaboElTiempo) {
      throw new Error(`${fuente} tardó demasiado en responder`, { cause: error })
    }
    // fetch lanza TypeError cuando no hay red ("Failed to fetch", "Load failed"...)
    if (error instanceof TypeError) {
      throw new Error(`No se pudo conectar con ${fuente}`, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(temporizador)
    signal?.removeEventListener('abort', cancelarDesdeAfuera)
  }
}

async function pedirConSenal(url, { senal, fuente, metodo, cuerpo }) {
  const respuesta = await fetch(url, { method: metodo, body: cuerpo, signal: senal })
  if (!respuesta.ok) {
    throw new Error(`${fuente} respondió ${respuesta.status}`)
  }
  return respuesta
}

// Hace la petición y devuelve la respuesta (Response) si salió bien.
// `tiempoLimiteMs` permite esperar más en fuentes lentas (por ejemplo, Overpass).
export function pedir(url, { signal, fuente, metodo = 'GET', tiempoLimiteMs } = {}) {
  return conTiempoLimite({ signal, fuente, tiempoLimiteMs }, (senal) => pedirConSenal(url, { senal, fuente, metodo }))
}

// Hace la petición y devuelve el cuerpo ya convertido desde JSON.
// Con `metodo: 'POST'` y `cuerpo` se puede enviar un formulario (por ejemplo, a Overpass).
export function obtenerJson(url, { signal, fuente, tiempoLimiteMs, metodo = 'GET', cuerpo } = {}) {
  return conTiempoLimite({ signal, fuente, tiempoLimiteMs }, async (senal) => {
    const respuesta = await pedirConSenal(url, { senal, fuente, metodo, cuerpo })
    try {
      return await respuesta.json()
    } catch (error) {
      // Si cancelaron la petición mientras se leía, se respeta la cancelación
      if (error.name === 'AbortError') throw error
      throw new Error(`Formato inesperado de ${fuente}`, { cause: error })
    }
  })
}
