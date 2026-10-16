import { describe, it, expect, vi, afterEach } from 'vitest'
import { pedir, obtenerJson } from './http.js'

// fetch falso que, como el real, se rechaza con AbortError cuando cancelan su señal
function fetchQueNuncaResponde() {
  return vi.fn((url, { signal }) => new Promise((resolver, rechazar) => {
    signal.addEventListener('abort', () => rechazar(new DOMException('Cancelado', 'AbortError')))
  }))
}

describe('pedir', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('usa el nombre de la fuente en los mensajes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(pedir('https://ejemplo.org', { fuente: 'GDACS' })).rejects.toThrow('GDACS respondió 500')
  })

  it('hace HEAD cuando se pide', async () => {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchFalso)

    await pedir('https://ejemplo.org/x.png', { fuente: 'NASA GIBS', metodo: 'HEAD' })

    expect(fetchFalso.mock.calls[0][0]).toBe('https://ejemplo.org/x.png')
    expect(fetchFalso.mock.calls[0][1].method).toBe('HEAD')
  })

  it('devuelve la respuesta cuando todo sale bien', async () => {
    const respuesta = { ok: true, status: 200 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta))
    await expect(pedir('https://ejemplo.org', { fuente: 'NOAA' })).resolves.toBe(respuesta)
  })

  it('se rinde a los 15 segundos', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchQueNuncaResponde())
    const verificacion = expect(pedir('https://ejemplo.org', { fuente: 'NOAA' })).rejects.toThrow(
      'NOAA tardó demasiado en responder',
    )

    await vi.advanceTimersByTimeAsync(15000)
    await verificacion
  })

  it('traduce el fallo de red', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')))
    await expect(pedir('https://ejemplo.org', { fuente: 'NASA GIBS' })).rejects.toThrow(
      'No se pudo conectar con NASA GIBS',
    )
  })

  it('respeta la cancelación de quien llama', async () => {
    vi.stubGlobal('fetch', fetchQueNuncaResponde())
    const controlador = new AbortController()
    const promesa = pedir('https://ejemplo.org', { signal: controlador.signal, fuente: 'NOAA' })

    controlador.abort()
    await expect(promesa).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('obtenerJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('devuelve el JSON de la respuesta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ a: 1 }) }))
    await expect(obtenerJson('https://ejemplo.org', { fuente: 'NOAA' })).resolves.toEqual({ a: 1 })
  })

  it('avisa si no es JSON', async () => {
    const noJson = { ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(noJson))
    await expect(obtenerJson('https://ejemplo.org', { fuente: 'NOAA' })).rejects.toThrow('Formato inesperado de NOAA')
  })
})
