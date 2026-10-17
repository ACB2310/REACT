import { useCallback, useState } from 'react'

// Tiempo máximo para que el GPS responda
export const TIEMPO_UBICACION_MS = 15000

export const MENSAJE_SIN_HTTPS =
  'Tu ubicación solo funciona si la página se abre con https. Toca el mapa en su lugar.'

// Errores de geolocalización en español (códigos de GeolocationPositionError)
function mensajeDeError(error) {
  if (error?.code === 1) return 'No diste permiso para usar tu ubicación.'
  if (error?.code === 3) return 'Tu ubicación tardó demasiado. Toca el mapa en su lugar.'
  return 'No se pudo obtener tu ubicación. Toca el mapa en su lugar.'
}

// Ubicación del celular, SOLO cuando se pide con `pedir()` (no al abrir la pantalla).
// `pedir()` devuelve una promesa con [longitud, latitud], o null si falló.
export function useUbicacion() {
  const [posicion, setPosicion] = useState(null)
  const [estado, setEstado] = useState('inactivo')
  const [error, setError] = useState(null)

  const pedir = useCallback(() => {
    // En una página http (por ejemplo, la prueba en AWS sin https) el navegador bloquea
    // el GPS aunque la persona dé permiso. Solo funciona con https o en localhost.
    if (globalThis.isSecureContext === false) {
      setEstado('error')
      setError(MENSAJE_SIN_HTTPS)
      return Promise.resolve(null)
    }
    if (!navigator.geolocation) {
      setEstado('error')
      setError('Este dispositivo no puede dar tu ubicación. Toca el mapa en su lugar.')
      return Promise.resolve(null)
    }
    setEstado('buscando')
    setError(null)
    return new Promise((resolver) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          // El GPS entrega latitud y longitud por separado; aquí se arman en [longitud, latitud]
          const nueva = [coords.longitude, coords.latitude]
          setPosicion(nueva)
          setEstado('listo')
          resolver(nueva)
        },
        (falla) => {
          setEstado('error')
          setError(mensajeDeError(falla))
          resolver(null)
        },
        { enableHighAccuracy: true, timeout: TIEMPO_UBICACION_MS, maximumAge: 60000 },
      )
    })
  }, [])

  return { posicion, estado, error, pedir }
}
