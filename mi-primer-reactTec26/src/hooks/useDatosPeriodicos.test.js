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
