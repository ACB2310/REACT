// Ubicación de la persona con el GPS del teléfono (API de geolocalización del navegador).
// El navegador pide permiso la primera vez; si se niega, se avisa con un mensaje claro.

const TIEMPO_LIMITE_UBICACION_MS = 15000
// Se acepta una ubicación de hasta 1 minuto de antigüedad: es más rápido y gasta menos batería
const ANTIGUEDAD_MAXIMA_MS = 60000

// Códigos de error de la API de geolocalización
const PERMISO_DENEGADO = 1

// Devuelve una promesa con [longitud, latitud]
export function obtenerUbicacionActual({ tiempoLimiteMs = TIEMPO_LIMITE_UBICACION_MS } = {}) {
  return new Promise((resolver, rechazar) => {
    const geolocalizacion = typeof navigator === 'undefined' ? undefined : navigator.geolocation
    if (!geolocalizacion) {
      rechazar(new Error('Este dispositivo no permite obtener la ubicación'))
      return
    }

    geolocalizacion.getCurrentPosition(
      (posicion) => {
        const { longitude: longitud, latitude: latitud } = posicion?.coords ?? {}
        if (!Number.isFinite(longitud) || !Number.isFinite(latitud)) {
          rechazar(new Error('No se pudo obtener tu ubicación'))
          return
        }
        // El navegador da latitud y longitud por separado; la app usa [longitud, latitud]
        resolver([longitud, latitud])
      },
      (error) => {
        rechazar(
          new Error(error?.code === PERMISO_DENEGADO ? 'Permiso de ubicación denegado' : 'No se pudo obtener tu ubicación'),
        )
      },
      { enableHighAccuracy: true, maximumAge: ANTIGUEDAD_MAXIMA_MS, timeout: tiempoLimiteMs },
    )
  })
}
