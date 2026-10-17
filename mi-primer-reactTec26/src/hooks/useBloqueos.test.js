import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBloqueos } from './useBloqueos.js'
import { obtenerBloqueos, suscribirseABloqueos } from '../services/bloqueos.js'

const { config } = vi.hoisted(() => ({ config: { configurado: true } }))
vi.mock('../services/supabase.js', () => ({
  get supabaseConfigurado() {
    return config.configurado
  },
  MENSAJE_SIN_CONFIGURAR: 'Supabase no está configurado',
}))
vi.mock('../services/bloqueos.js', () => ({
  obtenerBloqueos: vi.fn(),
  suscribirseABloqueos: vi.fn(),
}))

const AHORA = Date.UTC(2026, 9, 16, 20, 0)

function bloqueo(id, minutosParaVencer) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-103.35, 20.67] },
    properties: { id, tipo: 'total', expiraEn: AHORA + minutosParaVencer * 60000 },
  }
}

async function esperarPromesas() {
  await act(async () => {})
}

describe('useBloqueos', () => {
  let avisarCambio
  let cancelar

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AHORA)
    config.configurado = true
    cancelar = vi.fn()
    obtenerBloqueos.mockReset()
    obtenerBloqueos.mockResolvedValue({
      datos: { type: 'FeatureCollection', features: [bloqueo(1, 30), bloqueo(2, 90)] },
      actualizadoEn: AHORA,
    })
    suscribirseABloqueos.mockReset()
    suscribirseABloqueos.mockImplementation((alCambiar) => {
      avisarCambio = alCambiar
      return cancelar
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('entrega los bloqueos vigentes', async () => {
    const { result } = renderHook(() => useBloqueos())
    await esperarPromesas()

    expect(result.current.estado).toBe('listo')
    expect(result.current.bloqueos.features).toHaveLength(2)
  })

  it('un evento de tiempo real recarga los bloqueos sin mostrar "cargando"', async () => {
    const { result } = renderHook(() => useBloqueos())
    await esperarPromesas()
    expect(obtenerBloqueos).toHaveBeenCalledTimes(1)

    act(() => avisarCambio())
    expect(result.current.estado).toBe('listo')
    await esperarPromesas()

    expect(obtenerBloqueos).toHaveBeenCalledTimes(2)
  })

  // Revisión de la migración 4: muchos avisos seguidos (reales o falsos) no deben hacer
  // que cada teléfono pida la lista sin parar
  it('muchos avisos seguidos recargan como máximo una vez cada 5 segundos', async () => {
    renderHook(() => useBloqueos())
    await esperarPromesas()
    expect(obtenerBloqueos).toHaveBeenCalledTimes(1)

    act(() => {
      for (let i = 0; i < 50; i++) avisarCambio()
    })
    await esperarPromesas()
    // El primero recarga de inmediato
    expect(obtenerBloqueos).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999)
    })
    expect(obtenerBloqueos).toHaveBeenCalledTimes(2)

    // Los demás se juntan en una sola recarga al terminar los 5 s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(obtenerBloqueos).toHaveBeenCalledTimes(3)
  })

  // La ruta de evacuación se recalcula cuando cambia la lista: si en la revisión de cada
  // minuto no venció ninguno, la lista debe ser la MISMA (no una copia igual)
  it('si no vence ninguno, la revisión de cada minuto devuelve la misma lista', async () => {
    const { result } = renderHook(() => useBloqueos())
    await esperarPromesas()
    const antes = result.current.bloqueos

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(result.current.bloqueos).toBe(antes)
  })

  it('un bloqueo que vence desaparece sin recargar', async () => {
    const { result } = renderHook(() => useBloqueos())
    await esperarPromesas()

    // A los 31 minutos ya venció el primero; la recarga de respaldo aún no llega
    obtenerBloqueos.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31 * 60000)
    })

    expect(result.current.bloqueos.features.map((b) => b.properties.id)).toEqual([2])
  })

  it('cancela la suscripción al desmontar', async () => {
    const { unmount } = renderHook(() => useBloqueos())
    await esperarPromesas()

    unmount()
    expect(cancelar).toHaveBeenCalled()
  })

  it('sin configuración no pide nada y lo dice', async () => {
    config.configurado = false
    const { result } = renderHook(() => useBloqueos())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60000)
    })

    expect(obtenerBloqueos).not.toHaveBeenCalled()
    expect(suscribirseABloqueos).not.toHaveBeenCalled()
    expect(result.current.estado).toBe('error')
    expect(result.current.error).toBe('Supabase no está configurado')
  })
})
