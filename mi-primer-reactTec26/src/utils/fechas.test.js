import { describe, it, expect } from 'vitest'
import { formatearFechaHora } from './fechas.js'

describe('formatearFechaHora', () => {
  it('usa la hora de Ciudad de México en formato 24 h', () => {
    // 1700000000000 = 2023-11-14 22:13:20 UTC = 16:13 en CDMX (UTC-6)
    const texto = formatearFechaHora(1700000000000)
    expect(texto).toContain('16:13')
    expect(texto).toContain('2023')
    expect(texto).toMatch(/nov/i)
  })

  it('devuelve "sin fecha" si no recibe un número', () => {
    expect(formatearFechaHora(null)).toBe('sin fecha')
  })
})
