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
