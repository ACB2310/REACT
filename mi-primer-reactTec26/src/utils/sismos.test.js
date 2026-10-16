import { describe, it, expect } from 'vitest'
import { filtrarSismosMexico, expresionColorMagnitud, etiquetaMagnitud, agregarProfundidad } from './sismos.js'
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

describe('agregarProfundidad', () => {
  // MapLibre descarta la tercera coordenada al dibujar, así que la profundidad se copia a properties
  it('copia la profundidad de coordinates[2] a properties.profundidadKm', () => {
    const resultado = agregarProfundidad(sismosEjemplo)
    expect(resultado.features.map((f) => f.properties.profundidadKm)).toEqual([30, 20, 10, 5])
    expect(resultado.features[1].properties.place).toBe('15 km SO de Acapulco, Guerrero')
  })

  it('deja profundidadKm en null si no hay tercera coordenada y no modifica la original', () => {
    const sinProfundidad = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id: 'x', geometry: { type: 'Point', coordinates: [-99, 17] }, properties: { mag: 4 } }],
    }
    expect(agregarProfundidad(sinProfundidad).features[0].properties.profundidadKm).toBeNull()
    expect(sinProfundidad.features[0].properties).toEqual({ mag: 4 })
  })
})
