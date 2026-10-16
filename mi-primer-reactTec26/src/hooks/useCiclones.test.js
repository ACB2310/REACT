import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCiclones } from './useCiclones.js'
import { obtenerCiclonesNhc } from '../services/nhc.js'
import { obtenerCiclonesGdacs } from '../services/gdacs.js'
import { nhcEjemplo, eventosGdacsEjemplo } from '../mocks/ciclonesEjemplo.js'

vi.mock('../services/nhc.js', () => ({ obtenerCiclonesNhc: vi.fn() }))
vi.mock('../services/gdacs.js', () => ({ obtenerCiclonesGdacs: vi.fn() }))

const respuestaNhc = { ...nhcEjemplo, actualizadoEn: 1792184930000 }
const respuestaGdacs = { eventos: eventosGdacsEjemplo, actualizadoEn: Date.UTC(2026, 9, 16, 21, 10) }

async function avanzar(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useCiclones', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    obtenerCiclonesNhc.mockReset().mockResolvedValue(respuestaNhc)
    obtenerCiclonesGdacs.mockReset().mockResolvedValue(respuestaGdacs)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('combina las dos fuentes cuando ambas responden', async () => {
    const { result } = renderHook(() => useCiclones())
    await avanzar(0)

    expect(result.current.ciclones.map((c) => c.nombre)).toEqual(['Trudy', 'Simon'])
    expect(result.current.eventosGdacsSinNhc.features.map((f) => f.properties.eventname)).toEqual(['SIMON-26'])
    expect(result.current.nhc.datos.conos.features).toHaveLength(1)
    expect(result.current.nhc.actualizadoEn).toBe(1792184930000)
    expect(result.current.gdacs.actualizadoEn).toBe(Date.UTC(2026, 9, 16, 21, 10))
  })

  it('si GDACS falla conserva los ciclones de NHC y reporta el error de GDACS', async () => {
    obtenerCiclonesGdacs.mockRejectedValue(new Error('No se pudo conectar con GDACS'))
    const { result } = renderHook(() => useCiclones())
    await avanzar(0)

    expect(result.current.ciclones.map((c) => c.nombre)).toEqual(['Trudy'])
    expect(result.current.gdacs.estado).toBe('error')
    expect(result.current.gdacs.error).toBe('No se pudo conectar con GDACS')
    expect(result.current.nhc.estado).toBe('listo')
  })

  it('pide cada fuente cada 15 minutos', async () => {
    renderHook(() => useCiclones())
    await avanzar(0)
    await avanzar(899999)
    expect(obtenerCiclonesNhc).toHaveBeenCalledTimes(1)
    expect(obtenerCiclonesGdacs).toHaveBeenCalledTimes(1)

    await avanzar(1)
    expect(obtenerCiclonesNhc).toHaveBeenCalledTimes(2)
    expect(obtenerCiclonesGdacs).toHaveBeenCalledTimes(2)
  })
})
