import { describe, it, expect } from 'vitest'
import {
  MAGNITUD_FUERTE,
  SISMOS_ACTIVOS_HORAS,
  radioInfluenciaKm,
  radioCriticoKm,
  factorRiesgoSismico,
  filtrarSismosActivos,
} from './riesgoSismico.js'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'

// Tramos del escenario de Acapulco (gro1: M 6.3 en [-99.9, 17.0])
const TRAMO_DIRECTO = [[-99.7, 16.92], [-99.9, 16.95]] // a 5.56 km del epicentro
const TRAMO_SUR = [[-99.7, 16.92], [-99.9, 16.8]] // a 18.84 km del epicentro
const TRAMO_MONTERREY = [[-100.31, 25.67], [-100.305, 25.67]] // a ~965 km de gro1

function coleccion(...sismos) {
  return { type: 'FeatureCollection', features: sismos }
}
function sismo(mag, coordenadas, time = 0) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: coordenadas }, properties: { mag, time } }
}

describe('radios por magnitud', () => {
  it('calcula el radio de influencia y el crítico', () => {
    expect(radioInfluenciaKm(6.3)).toBeCloseTo(44.67, 1)
    expect(radioCriticoKm(6.3)).toBeCloseTo(11.17, 1)
    expect(radioInfluenciaKm(5.2)).toBeCloseTo(12.59, 1)
    expect(radioInfluenciaKm(2.5)).toBeCloseTo(0.562, 2)
  })

  it('expone las constantes del plan', () => {
    expect(MAGNITUD_FUERTE).toBe(6.0)
    expect(SISMOS_ACTIVOS_HORAS).toBe(72)
  })
})

describe('factorRiesgoSismico', () => {
  it('bloquea un tramo a 5.56 km de gro1', () => {
    expect(factorRiesgoSismico(TRAMO_DIRECTO, sismosEjemplo)).toBe(Infinity)
  })

  it('penaliza sin bloquear a 18.84 km de gro1', () => {
    // (6.3 / 2) * (1 - 18.84 / 44.67) ≈ 1.821
    expect(factorRiesgoSismico(TRAMO_SUR, sismosEjemplo)).toBeCloseTo(1.821, 1)
  })

  it('un sismo menor a 6 nunca bloquea', () => {
    const factor = factorRiesgoSismico(TRAMO_DIRECTO, coleccion(sismo(5.9, [-99.8, 16.935])))
    expect(Number.isFinite(factor)).toBe(true)
    expect(factor).toBeGreaterThan(0)
  })

  it('suma el aporte de varios sismos cercanos', () => {
    const uno = factorRiesgoSismico(TRAMO_MONTERREY, coleccion(sismo(4.0, [-100.307, 25.671])))
    const dos = factorRiesgoSismico(
      TRAMO_MONTERREY,
      coleccion(sismo(4.0, [-100.307, 25.671]), sismo(4.0, [-100.308, 25.671])),
    )
    expect(dos).toBeGreaterThan(uno)
  })

  it('lejos de todo sismo el factor es 0', () => {
    expect(factorRiesgoSismico(TRAMO_MONTERREY, sismosEjemplo)).toBe(0)
  })

  it('mag null no aporta y no rompe', () => {
    expect(factorRiesgoSismico(TRAMO_MONTERREY, coleccion(sismo(null, [-100.307, 25.67])))).toBe(0)
  })

  it('sin sismos (null o colección vacía) el factor es 0', () => {
    expect(factorRiesgoSismico(TRAMO_DIRECTO, null)).toBe(0)
    expect(factorRiesgoSismico(TRAMO_DIRECTO, coleccion())).toBe(0)
  })
})

describe('filtrarSismosActivos', () => {
  it('deja solo los de las últimas 72 h', () => {
    const ahora = Date.UTC(2026, 9, 16, 12)
    const hace = (horas) => ahora - horas * 3600000
    const sismos = coleccion(sismo(6.3, [-99.9, 17], hace(2)), sismo(5.0, [-99.9, 17], hace(71)), sismo(6.8, [-99.9, 17], hace(73)))

    const activos = filtrarSismosActivos(sismos, ahora)
    expect(activos.features.map((s) => s.properties.mag)).toEqual([6.3, 5.0])
  })

  it('no descarta un sismo reciente si el reloj del teléfono va atrasado', () => {
    const ahora = Date.UTC(2026, 9, 16, 12)
    // USGS dice que fue 5 minutos "después" de la hora del teléfono
    const sismos = coleccion(sismo(6.3, [-99.9, 17], ahora + 5 * 60000))
    expect(filtrarSismosActivos(sismos, ahora).features).toHaveLength(1)
  })

  it('acepta otra ventana de horas y no modifica la original', () => {
    const ahora = Date.UTC(2026, 9, 16, 12)
    const sismos = coleccion(sismo(6.3, [-99.9, 17], ahora - 10 * 3600000))

    expect(filtrarSismosActivos(sismos, ahora, 6).features).toHaveLength(0)
    expect(sismos.features).toHaveLength(1)
  })

  it('sin colección devuelve una vacía', () => {
    expect(filtrarSismosActivos(null, Date.now())).toEqual({ type: 'FeatureCollection', features: [] })
  })
})
