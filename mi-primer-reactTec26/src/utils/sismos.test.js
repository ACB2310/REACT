import { describe, it, expect } from 'vitest'
import { filtrarSismosMexico, expresionColorMagnitud, etiquetaMagnitud } from './sismos.js'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'

describe('filtrarSismosMexico', () => {
  it('conserva solo los sismos dentro de la caja de México', () => {
    const ids = filtrarSismosMexico(sismosEjemplo).features.map((f) => f.id)
    expect(ids).toEqual(['oax1', 'gro1', 'bc1'])
  })

  it('descarta un sismo con las coordenadas invertidas [lat, lon]', () => {
    const invertido = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id: 'x', geometry: { type: 'Point', coordinates: [17.0, -99.9] }, properties: {} }],
    }
    expect(filtrarSismosMexico(invertido).features).toHaveLength(0)
  })

  it('no modifica la colección original', () => {
    filtrarSismosMexico(sismosEjemplo)
    expect(sismosEjemplo.features).toHaveLength(4)
  })
})

describe('expresionColorMagnitud', () => {
  it('arma la expresión de color por magnitud', () => {
    expect(expresionColorMagnitud()).toEqual([
      'step', ['coalesce', ['get', 'mag'], 0], '#eab308', 4, '#f97316', 6, '#dc2626',
    ])
  })
})

describe('etiquetaMagnitud', () => {
  it('etiqueta la magnitud con un decimal o "M ?"', () => {
    expect(etiquetaMagnitud(5.234)).toBe('M 5.2')
    expect(etiquetaMagnitud(null)).toBe('M ?')
  })
})
