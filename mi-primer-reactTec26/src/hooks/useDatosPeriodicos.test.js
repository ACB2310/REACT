import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDatosPeriodicos } from './useDatosPeriodicos.js'

const obtener = vi.fn()

async function esperarPromesas() {
  await act(async () => {})
}

async function avanzar(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useDatosPeriodicos', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    obtener.mockReset()
    obtener.mockResolvedValue({ datos: ['a'], actualizadoEn: 1700000000000 })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('entrega datos y actualizadoEn de la función obtener', async () => {
    const { result } = renderHook(() => useDatosPeriodicos(obtener, 60000))
    await esperarPromesas()

    expect(result.current.datos).toEqual(['a'])
    expect(result.current.actualizadoEn).toBe(1700000000000)
    expect(result.current.estado).toBe('listo')
  })

  // Si la fuente no trae hora (por ejemplo, no hay tormentas), al menos se sabe cuándo se consultó
  it('guarda consultadoEn con la hora de la última descarga exitosa', async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 16, 21, 30))
    obtener.mockResolvedValue({ datos: [], actualizadoEn: null })
    const { result } = renderHook(() => useDatosPeriodicos(obtener, 60000))
    expect(result.current.consultadoEn).toBeNull()

    await esperarPromesas()
    expect(result.current.actualizadoEn).toBeNull()
    expect(result.current.consultadoEn).toBe(Date.UTC(2026, 9, 16, 21, 30))
  })

  it('respeta el intervalo que recibe', async () => {
    renderHook(() => useDatosPeriodicos(obtener, 60000))
    await esperarPromesas()
    await avanzar(59999)
    expect(obtener).toHaveBeenCalledTimes(1)

    await avanzar(1)
    expect(obtener).toHaveBeenCalledTimes(2)
  })

  it('no pide nada mientras activo es false', async () => {
    const { result } = renderHook(() => useDatosPeriodicos(obtener, 60000, { activo: false }))
    await esperarPromesas()
    await avanzar(600000)

    expect(obtener).not.toHaveBeenCalled()
    expect(result.current.datos).toBeNull()
  })

  it('carga en cuanto activo pasa a true', async () => {
    const { rerender } = renderHook(({ activo }) => useDatosPeriodicos(obtener, 60000, { activo }), {
      initialProps: { activo: false },
    })
    await esperarPromesas()

    rerender({ activo: true })
    await esperarPromesas()
    expect(obtener).toHaveBeenCalledTimes(1)
  })

  it('deja de pedir al pasar activo a false', async () => {
    const { rerender } = renderHook(({ activo }) => useDatosPeriodicos(obtener, 60000, { activo }), {
      initialProps: { activo: true },
    })
    await esperarPromesas()

    rerender({ activo: false })
    await avanzar(600000)
    expect(obtener).toHaveBeenCalledTimes(1)
  })
})

describe('useDatosPeriodicos: recarga silenciosa', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    obtener.mockReset()
    obtener.mockResolvedValue({ datos: ['a'], actualizadoEn: 1 })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('recargar({ silencioso: true }) pide de nuevo sin pasar a "cargando"', async () => {
    const { result } = renderHook(() => useDatosPeriodicos(obtener, 60000))
    await esperarPromesas()

    act(() => result.current.recargar({ silencioso: true }))
    expect(result.current.estado).toBe('listo')
    await esperarPromesas()
    expect(obtener).toHaveBeenCalledTimes(2)
  })
})

// Etapa 7: sin señal, la app muestra la última copia guardada en el teléfono (con su hora)
describe('useDatosPeriodicos con guardarComo (copia sin conexión)', () => {
  const CLAVE = 'datos:v1:prueba'
  const AHORA = Date.UTC(2026, 9, 17, 18, 0)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AHORA)
    localStorage.clear()
    obtener.mockReset()
    obtener.mockResolvedValue({ datos: ['nuevo'], actualizadoEn: AHORA - 60000 })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function guardarCopia(copia) {
    localStorage.setItem(CLAVE, JSON.stringify(copia))
  }

  it('guarda la última respuesta buena', async () => {
    renderHook(() => useDatosPeriodicos(obtener, 60000, { guardarComo: 'prueba' }))
    await esperarPromesas()
    expect(JSON.parse(localStorage.getItem(CLAVE))).toEqual({
      datos: ['nuevo'],
      actualizadoEn: AHORA - 60000,
      consultadoEn: AHORA,
      guardadoEn: AHORA,
    })
  })

  it('sin señal usa la copia guardada y dice que viene del teléfono', async () => {
    guardarCopia({ datos: ['viejo'], actualizadoEn: AHORA - 7200000, consultadoEn: AHORA - 3600000, guardadoEn: AHORA - 3600000 })
    obtener.mockRejectedValue(new Error('Sin conexión'))
    const { result } = renderHook(() => useDatosPeriodicos(obtener, 60000, { guardarComo: 'prueba' }))
    // Desde el primer momento, sin esperar a que falle la descarga
    expect(result.current.datos).toEqual(['viejo'])
    expect(result.current.desdeAlmacen).toBe(true)

    await esperarPromesas()
    expect(result.current.datos).toEqual(['viejo'])
    expect(result.current.actualizadoEn).toBe(AHORA - 7200000)
    expect(result.current.consultadoEn).toBe(AHORA - 3600000)
    expect(result.current.estado).toBe('error')
    expect(result.current.desdeAlmacen).toBe(true)
  })

  it('al llegar datos nuevos ya no viene del teléfono', async () => {
    guardarCopia({ datos: ['viejo'], actualizadoEn: 1, consultadoEn: 1, guardadoEn: AHORA - 1000 })
    const { result } = renderHook(() => useDatosPeriodicos(obtener, 60000, { guardarComo: 'prueba' }))
    await esperarPromesas()
    expect(result.current.datos).toEqual(['nuevo'])
    expect(result.current.desdeAlmacen).toBe(false)
  })

  it('una copia de más de 7 días no se usa', async () => {
    guardarCopia({ datos: ['muy-viejo'], actualizadoEn: 1, consultadoEn: 1, guardadoEn: AHORA - 8 * 86400000 })
    obtener.mockRejectedValue(new Error('Sin conexión'))
    const { result } = renderHook(() => useDatosPeriodicos(obtener, 60000, { guardarComo: 'prueba' }))
    expect(result.current.datos).toBeNull()
    expect(result.current.desdeAlmacen).toBe(false)
  })

  it('una copia rota se ignora', () => {
    localStorage.setItem(CLAVE, '{no es json')
    const { result } = renderHook(() => useDatosPeriodicos(obtener, 60000, { guardarComo: 'prueba' }))
    expect(result.current.datos).toBeNull()
  })

  it('sin guardarComo no guarda nada', async () => {
    renderHook(() => useDatosPeriodicos(obtener, 60000))
    await esperarPromesas()
    expect(localStorage.length).toBe(0)
  })

  it('con el almacenamiento bloqueado (o lleno) la app sigue igual', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => useDatosPeriodicos(obtener, 60000, { guardarComo: 'prueba' }))
    await esperarPromesas()
    expect(result.current.datos).toEqual(['nuevo'])
    expect(result.current.estado).toBe('listo')
  })
})
