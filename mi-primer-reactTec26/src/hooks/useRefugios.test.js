import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRefugios } from './useRefugios.js'
import { obtenerRefugios } from '../services/refugios.js'

const { config } = vi.hoisted(() => ({ config: { configurado: true } }))
vi.mock('../services/supabase.js', () => ({
  get supabaseConfigurado() {
    return config.configurado
  },
  MENSAJE_SIN_CONFIGURAR: 'Supabase no está configurado',
}))
vi.mock('../services/refugios.js', () => ({ obtenerRefugios: vi.fn() }))

const COLECCION = { type: 'FeatureCollection', features: [] }
const LISTA = [{ id: 2, nombre: 'Sin ubicación', posicion: null }]

describe('useRefugios', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    config.configurado = true
    obtenerRefugios.mockReset()
    obtenerRefugios.mockResolvedValue({ datos: COLECCION, refugios: LISTA, actualizadoEn: 1 })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('entrega la colección para el mapa y la lista completa', async () => {
    const { result } = renderHook(() => useRefugios())
    await act(async () => {})

    expect(result.current.refugios).toBe(COLECCION)
    expect(result.current.lista).toBe(LISTA)
    expect(result.current.actualizadoEn).toBe(1)
  })

  it('se actualiza cada 10 minutos', async () => {
    renderHook(() => useRefugios())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600000)
    })
    expect(obtenerRefugios).toHaveBeenCalledTimes(2)
  })

  it('sin configuración no programa recargas', async () => {
    config.configurado = false
    const { result } = renderHook(() => useRefugios())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3600000)
    })

    expect(obtenerRefugios).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Supabase no está configurado')
  })
})
