// Ubicación de la persona con el GPS del teléfono (API de geolocalización del navegador).
// El navegador pide permiso la primera vez; si se niega, se avisa con un mensaje claro.

const TIEMPO_LIMITE_UBICACION_MS = 15000
// Algunos navegadores no empiezan a contar el tiempo límite mientras el aviso de permiso
// sigue abierto: este margen extra evita que la app se quede esperando para siempre
const MARGEN_EXTRA_MS = 5000
// Se acepta una ubicación de hasta 1 minuto de antigüedad: es más rápido y gasta menos batería
const ANTIGUEDAD_MAXIMA_MS = 60000

// Códigos de error de la API de geolocalización
const PERMISO_DENEGADO = 1

function crearError(error) {
  // En una página sin https (por ejemplo, abrir la app con la IP de la red local en el
  // teléfono) el navegador niega la ubicación aunque la persona dé permiso
  if (globalThis.isSecureContext === false) {
    return new Error('La ubicación solo funciona si la página se abre con https')
  }
  return new Error(error?.code === PERMISO_DENEGADO ? 'Permiso de ubicación denegado' : 'No se pudo obtener tu ubicación')
}

// Devuelve una promesa con { coordenadas: [longitud, latitud], precisionM }.
// `precisionM` es el margen de error en metros que reporta el teléfono (null si no lo da):
// una ubicación aproximada por Wi-Fi o antenas puede fallar por kilómetros, así que quien
// llama debe revisarla antes de calcular una ruta.
export function obtenerUbicacionActual({ tiempoLimiteMs = TIEMPO_LIMITE_UBICACION_MS } = {}) {
  return new Promise((resolver, rechazar) => {
    const geolocalizacion = typeof navigator === 'undefined' ? undefined : navigator.geolocation
    if (!geolocalizacion) {
      rechazar(new Error('Este dispositivo no permite obtener la ubicación'))
      return
    }

    const respaldo = setTimeout(
      () => rechazar(new Error('No se pudo obtener tu ubicación')),
      tiempoLimiteMs + MARGEN_EXTRA_MS,
    )

    geolocalizacion.getCurrentPosition(
      (posicion) => {
        clearTimeout(respaldo)
        const { longitude: longitud, latitude: latitud, accuracy } = posicion?.coords ?? {}
        const valida = Number.isFinite(longitud) && Number.isFinite(latitud) && Math.abs(longitud) <= 180 && Math.abs(latitud) <= 90
        if (!valida) {
          rechazar(new Error('No se pudo obtener tu ubicación'))
          return
        }
        // El navegador da latitud y longitud por separado; la app usa [longitud, latitud]
        resolver({
          coordenadas: [longitud, latitud],
          precisionM: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
        })
      },
      (error) => {
        clearTimeout(respaldo)
        rechazar(crearError(error))
      },
      { enableHighAccuracy: true, maximumAge: ANTIGUEDAD_MAXIMA_MS, timeout: tiempoLimiteMs },
    )
  })
}
