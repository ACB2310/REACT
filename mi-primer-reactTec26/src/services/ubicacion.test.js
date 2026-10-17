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
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('devuelve [longitud, latitud] y la precisión en metros', async () => {
    simularGeolocalizacion((exito) => exito({ coords: { latitude: 19.43, longitude: -99.13, accuracy: 20 } }))
    await expect(obtenerUbicacionActual()).resolves.toEqual({ coordenadas: [-99.13, 19.43], precisionM: 20 })
  })

  // Un GPS aproximado (Wi-Fi, antenas) puede fallar por kilómetros: quien llama debe poder saberlo
  it('entrega una precisión mala tal cual, sin esconderla', async () => {
    simularGeolocalizacion((exito) => exito({ coords: { latitude: 19.43, longitude: -99.13, accuracy: 4000 } }))
    await expect(obtenerUbicacionActual()).resolves.toMatchObject({ precisionM: 4000 })
  })

  it('sin dato de precisión devuelve precisionM null', async () => {
    simularGeolocalizacion((exito) => exito({ coords: { latitude: 19.43, longitude: -99.13 } }))
    await expect(obtenerUbicacionActual()).resolves.toMatchObject({ precisionM: null })
  })

  it('pide alta precisión, ubicación de hasta 1 minuto y el tiempo límite indicado', async () => {
    const getCurrentPosition = simularGeolocalizacion((exito) =>
      exito({ coords: { latitude: 19.43, longitude: -99.13, accuracy: 10 } }),
    )
    await obtenerUbicacionActual({ tiempoLimiteMs: 8000 })
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, maximumAge: 60000, timeout: 8000 })
  })

  it('usa 15 segundos de tiempo límite si no se indica otro', async () => {
    const getCurrentPosition = simularGeolocalizacion((exito) =>
      exito({ coords: { latitude: 19.43, longitude: -99.13, accuracy: 10 } }),
    )
    await obtenerUbicacionActual()
    expect(getCurrentPosition.mock.calls[0][2].timeout).toBe(15000)
  })

  // Algunos navegadores no empiezan a contar mientras el aviso de permiso sigue abierto
  it('se rinde 5 s después del tiempo límite si el navegador nunca responde', async () => {
    vi.useFakeTimers()
    simularGeolocalizacion(() => {})
    let termino = false
    const promesa = obtenerUbicacionActual()
    promesa.catch(() => {}).finally(() => {
      termino = true
    })

    await vi.advanceTimersByTimeAsync(19999)
    expect(termino).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(promesa).rejects.toThrow('No se pudo obtener tu ubicación')
  })

  it('sin geolocalización en el dispositivo', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    await expect(obtenerUbicacionActual()).rejects.toThrow('Este dispositivo no permite obtener la ubicación')
  })

  it('en una página sin conexión segura lo explica', async () => {
    vi.stubGlobal('isSecureContext', false)
    simularGeolocalizacion((exito, fallo) => fallo({ code: 1 }))
    await expect(obtenerUbicacionActual()).rejects.toThrow(
      'La ubicación solo funciona si la página se abre con https',
    )
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

  it('una posición con coordenadas inválidas o fuera de rango es un error', async () => {
    simularGeolocalizacion((exito) => exito({ coords: { latitude: NaN, longitude: -99.13 } }))
    await expect(obtenerUbicacionActual()).rejects.toThrow('No se pudo obtener tu ubicación')
    simularGeolocalizacion((exito) => exito({ coords: { latitude: 999, longitude: -99.13 } }))
    await expect(obtenerUbicacionActual()).rejects.toThrow('No se pudo obtener tu ubicación')
  })
})
