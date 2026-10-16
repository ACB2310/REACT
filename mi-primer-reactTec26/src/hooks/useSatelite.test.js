import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSatelite } from './useSatelite.js'
import { obtenerHoraSatelite } from '../services/gibs.js'

vi.mock('../services/gibs.js', () => ({ obtenerHoraSatelite: vi.fn() }))

async function avanzar(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useSatelite', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    obtenerHoraSatelite.mockReset()
    obtenerHoraSatelite.mockResolvedValue({ datos: '2026-10-16T21:30:00Z', actualizadoEn: Date.UTC(2026, 9, 16, 21, 30) })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('no pide nada si la capa está apagada', async () => {
    renderHook(() => useSatelite(false))
    await avanzar(3600000)
    expect(obtenerHoraSatelite).not.toHaveBeenCalled()
  })

  it('con la capa prendida entrega la hora y la actualiza cada 10 minutos', async () => {
    const { result } = renderHook(() => useSatelite(true))
    await avanzar(0)
    expect(result.current.datos).toBe('2026-10-16T21:30:00Z')

    await avanzar(600000)
    expect(obtenerHoraSatelite).toHaveBeenCalledTimes(2)
  })
})
