import { describe, it, expect } from 'vitest'
import { calcularRutaEvacuacion } from './dijkstraEvacuacion.js'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'
import {
  grafoMonterrey,
  grafoAcapulco,
  grafoDosRefugios,
  grafoPuente,
  grafoAislado,
  bloqueoSobreM1M2,
  bloqueoTotalSobreC1C3,
} from '../mocks/grafoEvacuacionEjemplo.js'

const SIN_SISMOS = { type: 'FeatureCollection', features: [] }

describe('calcularRutaEvacuacion', () => {
  it('elige la ruta más rápida al refugio más cercano cuando no hay sismos cercanos', () => {
    const resultado = calcularRutaEvacuacion(grafoMonterrey, 'm1', ['m4', 'm5'], sismosEjemplo)

    expect(resultado.estado).toBe('ok')
    expect(resultado.refugioId).toBe('m4')
    expect(resultado.nodos).toEqual(['m1', 'm2', 'm4'])
    expect(Math.abs(resultado.distanciaM - 1002)).toBeLessThanOrEqual(5)
    expect(resultado.distanciaKm).toBe(1.0)
    expect(resultado.nivelRiesgo).toBe('bajo')
  })

  it('sin sismos va por el camino directo', () => {
    const resultado = calcularRutaEvacuacion(grafoAcapulco, 'a1', ['a4'], SIN_SISMOS)

    expect(resultado.nodos).toEqual(['a1', 'a2', 'a4'])
    expect(Math.abs(resultado.distanciaM - 43070)).toBeLessThanOrEqual(50)
  })

  it('desvía la ruta si gro1 (M 6.3) afecta el camino directo', () => {
    const resultado = calcularRutaEvacuacion(grafoAcapulco, 'a1', ['a4'], sismosEjemplo)

    // Más larga, pero lejos del epicentro: primero la seguridad
    expect(resultado.estado).toBe('ok')
    expect(resultado.nodos).toEqual(['a1', 'a3', 'a4'])
    expect(Math.abs(resultado.distanciaM - 50240)).toBeLessThanOrEqual(50)
    expect(resultado.distanciaKm).toBe(50.2)
    expect(resultado.nivelRiesgo).toBe('alto')
  })

  it('elige un segundo refugio si el más cercano queda en riesgo crítico', () => {
    const resultado = calcularRutaEvacuacion(grafoDosRefugios, 'c1', ['c2', 'c3'], sismosEjemplo)

    expect(resultado.refugioId).toBe('c3')
    expect(resultado.nodos).toEqual(['c1', 'c3'])
    expect(Math.abs(resultado.distanciaM - 23069)).toBeLessThanOrEqual(50)
  })

  it('elige por menor costo total y no por cercanía', () => {
    // Sin sismos, c2 (14.6 km) le gana a c3 (23.1 km)
    expect(calcularRutaEvacuacion(grafoDosRefugios, 'c1', ['c2', 'c3'], SIN_SISMOS).refugioId).toBe('c2')
  })

  it('evita un puente si hay un camino poco más largo', () => {
    const resultado = calcularRutaEvacuacion(grafoPuente, 'p1', ['p2'], SIN_SISMOS)
    expect(resultado.nodos).toEqual(['p1', 'p3', 'p2'])
  })

  it('devuelve LineString en orden [lon, lat]', () => {
    const { ruta } = calcularRutaEvacuacion(grafoMonterrey, 'm1', ['m4', 'm5'], SIN_SISMOS)

    expect(ruta.type).toBe('Feature')
    expect(ruta.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [-100.31, 25.67],
        [-100.305, 25.67],
        [-100.3, 25.67],
      ],
    })
    expect(ruta.properties).toMatchObject({ refugioId: 'm4', nivelRiesgo: 'bajo' })
    expect(ruta.properties.distanciaM).toBe(Math.round(ruta.properties.distanciaM))
  })

  it('un sismo con mag null no rompe ni cambia la ruta', () => {
    const conNull = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-100.307, 25.67] }, properties: { mag: null } }],
    }
    const sinSismos = calcularRutaEvacuacion(grafoMonterrey, 'm1', ['m4', 'm5'], SIN_SISMOS)
    expect(calcularRutaEvacuacion(grafoMonterrey, 'm1', ['m4', 'm5'], conNull)).toEqual(sinSismos)
  })

  it('origen aislado da un estado controlado', () => {
    expect(calcularRutaEvacuacion(grafoAislado, 'x1', ['m4', 'm5'], SIN_SISMOS)).toEqual({
      estado: 'sin-ruta',
      motivo: 'origen-aislado',
    })
  })

  it('todos los refugios inalcanzables da sin-ruta y nunca una ruta parcial', () => {
    const resultado = calcularRutaEvacuacion(grafoDosRefugios, 'c1', ['c2', 'c3'], sismosEjemplo, {
      bloqueos: [bloqueoTotalSobreC1C3],
    })
    expect(resultado).toEqual({ estado: 'sin-ruta', motivo: 'refugios-inalcanzables' })
  })

  it('nunca cruza un bloqueo total', () => {
    const resultado = calcularRutaEvacuacion(grafoMonterrey, 'm1', ['m4', 'm5'], SIN_SISMOS, {
      bloqueos: [bloqueoSobreM1M2('total')],
    })
    expect(resultado.refugioId).toBe('m5')
    expect(resultado.nodos).toEqual(['m1', 'm3', 'm5'])
  })

  it('un bloqueo sin tipo conocido se trata como total', () => {
    const resultado = calcularRutaEvacuacion(grafoMonterrey, 'm1', ['m4', 'm5'], SIN_SISMOS, {
      bloqueos: [bloqueoSobreM1M2(undefined)],
    })
    expect(resultado.nodos).toEqual(['m1', 'm3', 'm5'])
  })

  it('a pie sí cruza un bloqueo solo_vehiculos', () => {
    const resultado = calcularRutaEvacuacion(grafoMonterrey, 'm1', ['m4', 'm5'], SIN_SISMOS, {
      bloqueos: [bloqueoSobreM1M2('solo_vehiculos')],
    })
    expect(resultado.nodos).toEqual(['m1', 'm2', 'm4'])
  })

  it('si el origen ya es un punto de reunión la distancia es 0', () => {
    const resultado = calcularRutaEvacuacion(grafoMonterrey, 'm4', ['m4', 'm5'], SIN_SISMOS)
    expect(resultado).toMatchObject({ estado: 'ok', refugioId: 'm4', nodos: ['m4'], distanciaM: 0 })
    expect(resultado.ruta.geometry.coordinates).toEqual([
      [-100.3, 25.67],
      [-100.3, 25.67],
    ])
  })

  it('origen desconocido', () => {
    expect(calcularRutaEvacuacion(grafoMonterrey, 'zz', ['m4'], SIN_SISMOS)).toEqual({
      estado: 'sin-ruta',
      motivo: 'origen-desconocido',
    })
  })

  it('lista de refugios vacía o con ids que no existen', () => {
    expect(calcularRutaEvacuacion(grafoMonterrey, 'm1', [], SIN_SISMOS)).toEqual({
      estado: 'sin-ruta',
      motivo: 'sin-refugios',
    })
    expect(calcularRutaEvacuacion(grafoMonterrey, 'm1', ['no-existe'], SIN_SISMOS)).toEqual({
      estado: 'sin-ruta',
      motivo: 'sin-refugios',
    })
  })

  it('sin sismos (null) funciona igual que con una colección vacía', () => {
    expect(calcularRutaEvacuacion(grafoMonterrey, 'm1', ['m4', 'm5'], null)).toEqual(
      calcularRutaEvacuacion(grafoMonterrey, 'm1', ['m4', 'm5'], SIN_SISMOS),
    )
  })
})
