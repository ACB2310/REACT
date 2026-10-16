import { describe, it, expect } from 'vitest'
import { dentroDeCaja, distanciaMetros, distanciaPuntoSegmentoKm } from './geo.js'

describe('distanciaMetros', () => {
  // Valor calculado a mano con haversine: 0.005° de longitud a 25.67° de latitud
  it('mide la distancia entre dos puntos [lon, lat] en metros', () => {
    expect(distanciaMetros([-100.31, 25.67], [-100.305, 25.67])).toBeCloseTo(501.1, 0)
  })

  it('una distancia con [lat, lon] invertido da otro valor', () => {
    const correcta = distanciaMetros([-100.31, 25.67], [-100.305, 25.67])
    const invertida = distanciaMetros([25.67, -100.31], [25.67, -100.305])
    expect(Math.abs(invertida - correcta)).toBeGreaterThan(10)
  })
})

describe('distanciaPuntoSegmentoKm', () => {
  // Epicentro de gro1 contra el camino directo del escenario de Acapulco
  it('mide la distancia más corta de un punto a un tramo en km', () => {
    expect(distanciaPuntoSegmentoKm([-99.9, 17.0], [-99.7, 16.92], [-99.9, 16.95])).toBeCloseTo(5.56, 1)
  })

  it('un tramo de un solo punto (a == b) mide hasta ese punto sin dar NaN', () => {
    const km = distanciaPuntoSegmentoKm([-100.31, 25.68], [-100.31, 25.67], [-100.31, 25.67])
    expect(Number.isNaN(km)).toBe(false)
    expect(km).toBeCloseTo(1.11, 1)
  })

  it('si el punto queda más allá de un extremo, mide hasta ese extremo', () => {
    // A 0.01° al norte del extremo [-100.31, 25.67]: ~1.11 km
    expect(distanciaPuntoSegmentoKm([-100.31, 25.68], [-100.31, 25.67], [-100.30, 25.67])).toBeCloseTo(1.11, 1)
  })
})

const CAJA = [-118.5, 14.0, -86.0, 33.0]

describe('dentroDeCaja', () => {
  it('acepta un punto dentro y uno justo en el borde', () => {
    expect(dentroDeCaja([-99.1, 19.4], CAJA)).toBe(true)
    expect(dentroDeCaja([-118.5, 33.0], CAJA)).toBe(true)
  })

  it('rechaza un punto fuera', () => {
    expect(dentroDeCaja([142, 38], CAJA)).toBe(false)
  })

  it('rechaza coordenadas invertidas [lat, lon]', () => {
    expect(dentroDeCaja([19.4, -99.1], CAJA)).toBe(false)
  })

  it('rechaza coordenadas faltantes', () => {
    expect(dentroDeCaja(undefined, CAJA)).toBe(false)
    expect(dentroDeCaja([], CAJA)).toBe(false)
  })
})
