import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDatosPeriodicos } from './useDatosPeriodicos.js'
import { useSismos } from './useSismos.js'
import { useCiclones } from './useCiclones.js'
import { useRefugios } from './useRefugios.js'
import { useBloqueos } from './useBloqueos.js'
import { useZonasPeligro } from './useZonasPeligro.js'
import { useIncidentes, useBrigadas } from './useBrigadas.js'

// Etapa 7: qué datos se guardan en el teléfono para usarlos sin conexión.
// Regla: solo los PÚBLICOS. Incidentes y brigadas nunca (pueden traer datos sensibles).
vi.mock('./useDatosPeriodicos.js', () => ({
  useDatosPeriodicos: vi.fn(() => ({ datos: null, estado: 'cargando', recargar: vi.fn() })),
}))
vi.mock('../services/supabase.js', () => ({
  supabaseConfigurado: true,
  MENSAJE_SIN_CONFIGURAR: 'Supabase no está configurado',
  obtenerCliente: vi.fn(),
}))
vi.mock('./useAvisosTiempoReal.js', () => ({ useAvisosTiempoReal: vi.fn() }))
vi.mock('../services/bloqueos.js', () => ({ obtenerBloqueos: vi.fn(), suscribirseABloqueos: vi.fn(() => () => {}) }))

const clavesUsadas = () => useDatosPeriodicos.mock.calls.map(([, , opciones]) => opciones?.guardarComo ?? null)

describe('copias sin conexión', () => {
  beforeEach(() => {
    useDatosPeriodicos.mockClear()
  })

  it.each([
    ['sismos', useSismos, ['sismos']],
    ['ciclones', useCiclones, ['ciclones-nhc', 'ciclones-gdacs']],
    ['refugios', useRefugios, ['refugios']],
    ['bloqueos', useBloqueos, ['bloqueos']],
    ['zonas de peligro', useZonasPeligro, ['zonas']],
  ])('%s se guardan en el teléfono', (_, hook, claves) => {
    renderHook(() => hook())
    expect(clavesUsadas()).toEqual(claves)
  })

  it('incidentes y brigadas NO se guardan', () => {
    renderHook(() => useIncidentes(true))
    renderHook(() => useBrigadas(true))
    expect(clavesUsadas().every((clave) => clave === null)).toBe(true)
  })
})
