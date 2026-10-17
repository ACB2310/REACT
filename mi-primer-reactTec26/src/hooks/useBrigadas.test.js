import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIncidentes, useBrigadas, useMiAsignacion } from './useBrigadas.js'
import { obtenerIncidentes, suscribirseABrigadas } from '../services/incidentes.js'
import { obtenerBrigadas, obtenerMiAsignacion } from '../services/brigadas.js'

const { config } = vi.hoisted(() => ({ config: { configurado: true } }))
vi.mock('../services/supabase.js', () => ({
  get supabaseConfigurado() {
    return config.configurado
  },
  MENSAJE_SIN_CONFIGURAR: 'Supabase no está configurado',
}))
vi.mock('../services/incidentes.js', () => ({ obtenerIncidentes: vi.fn(), suscribirseABrigadas: vi.fn() }))
vi.mock('../services/brigadas.js', () => ({ obtenerBrigadas: vi.fn(), obtenerMiAsignacion: vi.fn() }))

const VACIA = { type: 'FeatureCollection', features: [] }

async function esperarPromesas() {
  await act(async () => {})
}

describe('hooks de brigadas', () => {
  let avisar
  let cancelar

  beforeEach(() => {
    vi.useFakeTimers()
    config.configurado = true
    cancelar = vi.fn()
    obtenerIncidentes.mockReset().mockResolvedValue({ datos: VACIA, actualizadoEn: 1 })
    obtenerBrigadas.mockReset().mockResolvedValue({ datos: VACIA, actualizadoEn: 2 })
    obtenerMiAsignacion.mockReset().mockResolvedValue({ datos: null, actualizadoEn: null })
    suscribirseABrigadas.mockReset().mockImplementation((alAvisar) => {
      avisar = alAvisar
      return cancelar
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('entregan sus datos con el nombre de cada uno', async () => {
    const incidentes = renderHook(() => useIncidentes(true))
    const brigadas = renderHook(() => useBrigadas(true))
    const mia = renderHook(() => useMiAsignacion(true))
    await esperarPromesas()

    expect(incidentes.result.current.incidentes).toBe(VACIA)
    expect(brigadas.result.current.brigadas).toBe(VACIA)
    expect(mia.result.current.asignacion).toBeNull()
    expect(mia.result.current.estado).toBe('listo')
  })

  it('para quien no es personal no piden nada ni escuchan', async () => {
    renderHook(() => useIncidentes(false))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600000)
    })
    expect(obtenerIncidentes).not.toHaveBeenCalled()
    expect(suscribirseABrigadas).not.toHaveBeenCalled()
  })

  it('un aviso de tiempo real recarga sin mostrar "cargando" y los avisos seguidos se juntan', async () => {
    const { result } = renderHook(() => useIncidentes(true))
    await esperarPromesas()
    expect(obtenerIncidentes).toHaveBeenCalledTimes(1)

    act(() => {
      for (let i = 0; i < 20; i++) avisar()
    })
    expect(result.current.estado).toBe('listo')
    await esperarPromesas()
    expect(obtenerIncidentes).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(obtenerIncidentes).toHaveBeenCalledTimes(3)
  })

  it('deja de escuchar al desmontar', async () => {
    const { unmount } = renderHook(() => useBrigadas(true))
    await esperarPromesas()
    unmount()
    expect(cancelar).toHaveBeenCalled()
  })

  it('sin Supabase lo dicen y no piden nada', async () => {
    config.configurado = false
    const { result } = renderHook(() => useMiAsignacion(true))
    await esperarPromesas()
    expect(obtenerMiAsignacion).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Supabase no está configurado')
  })
})
