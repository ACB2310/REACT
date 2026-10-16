import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSismos } from './useSismos.js'
import { obtenerSismos } from '../services/usgs.js'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'

vi.mock('../services/usgs.js', () => ({ obtenerSismos: vi.fn() }))

const resultadoEjemplo = {
  coleccion: { ...sismosEjemplo, features: sismosEjemplo.features.slice(0, 2) },
  generadoEn: 1700000000000,
}

// Deja que se resuelvan las promesas pendientes dentro de act()
async function esperarPromesas() {
  await act(async () => {})
}

describe('useSismos', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    obtenerSismos.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('empieza cargando y luego queda listo con los datos', async () => {
    obtenerSismos.mockResolvedValue(resultadoEjemplo)
    const { result } = renderHook(() => useSismos())

    expect(result.current.estado).toBe('cargando')
    expect(result.current.sismos).toBeNull()

    await esperarPromesas()
    expect(result.current.estado).toBe('listo')
    expect(result.current.sismos.features.map((f) => f.id)).toEqual(['oax1', 'gro1'])
    expect(result.current.actualizadoEn).toBe(1700000000000)
    expect(result.current.error).toBeNull()
  })

  it('pasa a error con el mensaje del servicio y sismos null en la primera carga', async () => {
    obtenerSismos.mockRejectedValue(new Error('USGS respondió 503'))
    const { result } = renderHook(() => useSismos())

    await esperarPromesas()
    expect(result.current.estado).toBe('error')
    expect(result.current.error).toBe('USGS respondió 503')
    expect(result.current.sismos).toBeNull()
  })

  it('vuelve a pedir datos cada 5 minutos', async () => {
    obtenerSismos.mockResolvedValue(resultadoEjemplo)
    renderHook(() => useSismos())
    await esperarPromesas()
    expect(obtenerSismos).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299999)
    })
    expect(obtenerSismos).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(obtenerSismos).toHaveBeenCalledTimes(2)
  })

  it('conserva los datos si falla una recarga', async () => {
    obtenerSismos
      .mockResolvedValueOnce(resultadoEjemplo)
      .mockRejectedValueOnce(new Error('USGS respondió 500'))
    const { result } = renderHook(() => useSismos())
    await esperarPromesas()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300000)
    })
    expect(result.current.estado).toBe('error')
    expect(result.current.error).toBe('USGS respondió 500')
    expect(result.current.sismos.features.map((f) => f.id)).toEqual(['oax1', 'gro1'])
    expect(result.current.actualizadoEn).toBe(1700000000000)
  })

  it('marca sinConexion con el evento offline y recarga con online', async () => {
    obtenerSismos.mockResolvedValue(resultadoEjemplo)
    const { result } = renderHook(() => useSismos())
    await esperarPromesas()
    expect(result.current.sinConexion).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.sinConexion).toBe(true)
    expect(result.current.sismos).not.toBeNull()

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await esperarPromesas()
    expect(result.current.sinConexion).toBe(false)
    expect(obtenerSismos).toHaveBeenCalledTimes(2)
  })

  it('aborta la petición al desmontar', async () => {
    let senal
    obtenerSismos.mockImplementation(({ signal }) => {
      senal = signal
      return new Promise(() => {})
    })
    const { unmount } = renderHook(() => useSismos())
    expect(senal.aborted).toBe(false)

    unmount()
    expect(senal.aborted).toBe(true)
  })

  it('ignora la cancelación y no la muestra como error', async () => {
    const abortado = new DOMException('Cancelado', 'AbortError')
    obtenerSismos.mockRejectedValueOnce(abortado).mockResolvedValue(resultadoEjemplo)
    const { result } = renderHook(() => useSismos())
    await esperarPromesas()

    expect(result.current.estado).not.toBe('error')
    expect(result.current.error).toBeNull()
  })

  it('recargar vuelve a llamar al servicio', async () => {
    obtenerSismos.mockRejectedValueOnce(new Error('USGS respondió 503')).mockResolvedValue(resultadoEjemplo)
    const { result } = renderHook(() => useSismos())
    await esperarPromesas()
    expect(result.current.estado).toBe('error')

    act(() => {
      result.current.recargar()
    })
    expect(result.current.estado).toBe('cargando')
    await esperarPromesas()
    expect(obtenerSismos).toHaveBeenCalledTimes(2)
    expect(result.current.estado).toBe('listo')
    expect(result.current.error).toBeNull()
  })
})
