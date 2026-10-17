import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useZonasPeligro } from './useZonasPeligro.js'
import { obtenerZonas } from '../services/zonas.js'
import { PREFIJO_COPIA } from './useDatosPeriodicos.js'

vi.mock('../services/zonas.js', () => ({ obtenerZonas: vi.fn(), suscribirseAZonas: vi.fn(() => () => {}) }))
vi.mock('../services/supabase.js', () => ({ supabaseConfigurado: true, MENSAJE_SIN_CONFIGURAR: 'Supabase no está configurado' }))

const AHORA = Date.UTC(2026, 9, 17, 18, 0)

function zona(id, expiraEn) {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Polygon', coordinates: [[[-101.7, 21.1], [-101.69, 21.1], [-101.69, 21.11], [-101.7, 21.1]]] },
    properties: { id, severidad: 1, expiraEn },
  }
}

describe('useZonasPeligro', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AHORA)
    localStorage.clear()
    obtenerZonas.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // Sin señal se usa la copia guardada: una zona que venció mientras tanto ya no cuenta
  it('de la copia sin conexión quita las zonas que ya vencieron', async () => {
    localStorage.setItem(
      `${PREFIJO_COPIA}zonas`,
      JSON.stringify({
        datos: { type: 'FeatureCollection', features: [zona(1, AHORA - 60000), zona(2, AHORA + 3600000), zona(3, null)] },
        actualizadoEn: AHORA - 7200000,
        consultadoEn: AHORA - 7200000,
        guardadoEn: AHORA - 7200000,
      }),
    )
    obtenerZonas.mockRejectedValue(new Error('Sin conexión'))
    const { result } = renderHook(() => useZonasPeligro())
    await act(async () => {})

    expect(result.current.zonas.features.map((z) => z.id)).toEqual([2, 3])
  })

  it('una zona que vence mientras la app está abierta se quita al minuto', async () => {
    obtenerZonas.mockResolvedValue({
      datos: { type: 'FeatureCollection', features: [zona(1, AHORA + 30000)] },
      actualizadoEn: AHORA,
    })
    const { result } = renderHook(() => useZonasPeligro())
    await act(async () => {})
    expect(result.current.zonas.features).toHaveLength(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(result.current.zonas.features).toHaveLength(0)
  })
})
