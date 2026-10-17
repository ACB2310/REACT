import { describe, it, expect, vi, afterEach } from 'vitest'
import { obtenerUbicacionActual } from './ubicacion.js'

// Reemplaza navigator.geolocation por uno falso que responde como se le indique
function simularGeolocalizacion(responder) {
  const getCurrentPosition = vi.fn((exito, fallo, opciones) => responder(exito, fallo, opciones))
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return getCurrentPosition
}

describe('obtenerUbicacionActual', () => {
  afterEach(() => {
    delete navigator.geolocation
  })

  it('devuelve [longitud, latitud]', async () => {
    simularGeolocalizacion((exito) => exito({ coords: { latitude: 19.43, longitude: -99.13, accuracy: 20 } }))
    await expect(obtenerUbicacionActual()).resolves.toEqual([-99.13, 19.43])
  })

  it('pide alta precisión, ubicación de hasta 1 minuto y el tiempo límite indicado', async () => {
    const getCurrentPosition = simularGeolocalizacion((exito) =>
      exito({ coords: { latitude: 19.43, longitude: -99.13 } }),
    )
    await obtenerUbicacionActual({ tiempoLimiteMs: 8000 })
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, maximumAge: 60000, timeout: 8000 })
  })

  it('usa 15 segundos de tiempo límite si no se indica otro', async () => {
    const getCurrentPosition = simularGeolocalizacion((exito) =>
      exito({ coords: { latitude: 19.43, longitude: -99.13 } }),
    )
    await obtenerUbicacionActual()
    expect(getCurrentPosition.mock.calls[0][2].timeout).toBe(15000)
  })

  it('sin geolocalización en el dispositivo', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    await expect(obtenerUbicacionActual()).rejects.toThrow('Este dispositivo no permite obtener la ubicación')
  })

  it('permiso denegado (código 1)', async () => {
    simularGeolocalizacion((exito, fallo) => fallo({ code: 1, message: 'User denied Geolocation' }))
    await expect(obtenerUbicacionActual()).rejects.toThrow('Permiso de ubicación denegado')
  })

  it('posición no disponible (código 2)', async () => {
    simularGeolocalizacion((exito, fallo) => fallo({ code: 2, message: 'Position unavailable' }))
    await expect(obtenerUbicacionActual()).rejects.toThrow('No se pudo obtener tu ubicación')
  })

  it('se acabó el tiempo (código 3)', async () => {
    simularGeolocalizacion((exito, fallo) => fallo({ code: 3, message: 'Timeout expired' }))
    await expect(obtenerUbicacionActual()).rejects.toThrow('No se pudo obtener tu ubicación')
  })

  it('una posición con coordenadas inválidas es un error', async () => {
    simularGeolocalizacion((exito) => exito({ coords: { latitude: NaN, longitude: -99.13 } }))
    await expect(obtenerUbicacionActual()).rejects.toThrow('No se pudo obtener tu ubicación')
  })
})
