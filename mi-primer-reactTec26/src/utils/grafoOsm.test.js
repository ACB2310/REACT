// @vitest-environment node
// Funciones puras sin DOM
import { describe, it, expect } from 'vitest'
import { VULNERABILIDAD_VIA, vulnerabilidadDeVia, nodoMasCercano, construirZonaEvacuacion } from './grafoOsm.js'
import { calcularRutaEvacuacion } from './dijkstraEvacuacion.js'
import { elementosOverpassEjemplo } from '../mocks/overpassEjemplo.js'

describe('vulnerabilidadDeVia', () => {
  it('usa la tabla del plan según highway', () => {
    expect(vulnerabilidadDeVia({ highway: 'footway' })).toBe(0)
    expect(vulnerabilidadDeVia({ highway: 'living_street' })).toBe(0.05)
    expect(vulnerabilidadDeVia({ highway: 'residential' })).toBe(0.1)
    expect(vulnerabilidadDeVia({ highway: 'tertiary' })).toBe(0.15)
    expect(vulnerabilidadDeVia({ highway: 'secondary' })).toBe(0.2)
    expect(vulnerabilidadDeVia({ highway: 'primary' })).toBe(0.25)
    expect(vulnerabilidadDeVia({ highway: 'steps' })).toBe(0.3)
    expect(VULNERABILIDAD_VIA.service).toBe(0.1)
  })

  it('vulnerabilidad de un puente residencial = 0.6', () => {
    expect(vulnerabilidadDeVia({ highway: 'residential', bridge: 'yes' })).toBeCloseTo(0.6, 10)
  })

  it('un túnel también suma 0.5', () => {
    expect(vulnerabilidadDeVia({ highway: 'footway', tunnel: 'yes' })).toBeCloseTo(0.5, 10)
  })

  it('un pasaje bajo un edificio no cuenta como túnel', () => {
    expect(vulnerabilidadDeVia({ highway: 'footway', tunnel: 'building_passage' })).toBe(0)
  })

  it('una vía donde caminar no se recomienda suma 0.3', () => {
    expect(vulnerabilidadDeVia({ highway: 'residential', foot: 'discouraged' })).toBeCloseTo(0.4, 10)
  })

  it('un tipo desconocido o sin tags vale 0.2', () => {
    expect(vulnerabilidadDeVia({ highway: 'raceway' })).toBe(0.2)
    expect(vulnerabilidadDeVia(undefined)).toBe(0.2)
  })
})

describe('construirZonaEvacuacion', () => {
  const { grafo, puntosReunion } = construirZonaEvacuacion(elementosOverpassEjemplo)

  it('convierte {lat, lon} a [lon, lat]', () => {
    expect(grafo.nodos['1'].coordenadas).toEqual([-100.31, 25.67])
    expect(grafo.nodos['5'].coordenadas).toEqual([-100.3, 25.675])
  })

  it('une vías que comparten un nodo', () => {
    const pares = grafo.aristas.map((a) => `${a.desde}-${a.hasta}`).sort()
    expect(pares).toEqual(['1-2', '2-3', '2-4', '3-5'])
  })

  it('omite vías privadas o sin paso peatonal', () => {
    expect(grafo.nodos['6']).toBeUndefined()
    expect(grafo.nodos['7']).toBeUndefined()
  })

  // Después de un sismo no se debe mandar a la gente por el arroyo de una avenida
  // que tiene su banqueta aparte (foot=use_sidepath) ni por lugares privados
  it('omite vías donde caminar no está permitido o hay que usar la banqueta aparte', () => {
    const viaCon = (id, tags) => ({
      type: 'way',
      id,
      nodes: [id * 10, id * 10 + 1],
      geometry: [{ lat: 25.7, lon: -100.31 }, { lat: 25.7, lon: -100.3 }],
      tags: { highway: 'primary', ...tags },
    })
    const prohibidas = [
      viaCon(1, { foot: 'use_sidepath' }),
      viaCon(2, { foot: 'private' }),
      viaCon(3, { access: 'customers' }),
      viaCon(4, { access: 'delivery' }),
      viaCon(5, { access: 'military' }),
    ]
    expect(construirZonaEvacuacion(prohibidas).grafo.aristas).toEqual([])
  })

  it('acepta vías con acceso general cerrado pero paso a pie permitido', () => {
    const viaCon = (id, foot) => ({
      type: 'way',
      id,
      nodes: [id * 10, id * 10 + 1],
      geometry: [{ lat: 25.7, lon: -100.31 }, { lat: 25.7, lon: -100.3 }],
      tags: { highway: 'service', access: 'no', foot },
    })
    const { grafo: g } = construirZonaEvacuacion([viaCon(1, 'yes'), viaCon(2, 'designated'), viaCon(3, 'permissive')])
    expect(g.aristas).toHaveLength(3)
  })

  it('cada arista lleva su tipo de vía y su vulnerabilidad', () => {
    const puente = grafo.aristas.find((a) => a.desde === '3' && a.hasta === '5')
    expect(puente).toMatchObject({ tipoVia: 'residential' })
    expect(puente.vulnerabilidad).toBeCloseTo(0.6, 10)
    expect(grafo.aristas.find((a) => a.desde === '2' && a.hasta === '4')).toMatchObject({ tipoVia: 'footway', vulnerabilidad: 0 })
  })

  it('pega el punto de reunión al nodo más cercano y conserva su nombre', () => {
    expect(puntosReunion).toContainEqual({
      id: 'reunion-900',
      nombre: 'Plaza Hidalgo',
      coordenadas: [-100.3001, 25.6702],
      nodoId: '3',
    })
  })

  it('un punto de reunión sin nombre se llama "Punto de reunión"', () => {
    expect(puntosReunion.find((p) => p.id === 'reunion-902')).toMatchObject({ nombre: 'Punto de reunión', nodoId: '4' })
  })

  it('descarta puntos de reunión lejos de las calles', () => {
    expect(puntosReunion.map((p) => p.id)).not.toContain('reunion-901')
    expect(puntosReunion).toHaveLength(2)
  })

  it('sin elementos devuelve un grafo y una lista vacíos', () => {
    expect(construirZonaEvacuacion([])).toEqual({ grafo: { nodos: {}, aristas: [] }, puntosReunion: [] })
  })

  it('ignora vías con geometría incompleta o que no coincide con sus nodos', () => {
    const rota = { type: 'way', id: 200, nodes: [1, 2, 3], geometry: [{ lat: 25.67, lon: -100.31 }], tags: { highway: 'residential' } }
    const conHueco = {
      type: 'way',
      id: 201,
      nodes: [8, 9],
      geometry: [{ lat: 25.68, lon: -100.31 }, null],
      tags: { highway: 'residential' },
    }
    const { grafo: g } = construirZonaEvacuacion([rota, conHueco])
    expect(g.aristas).toEqual([])
  })
})

describe('nodoMasCercano', () => {
  const { grafo } = construirZonaEvacuacion(elementosOverpassEjemplo)

  it('devuelve el nodo más cercano', () => {
    expect(nodoMasCercano(grafo, [-100.3049, 25.6701])).toBe('2')
  })

  it('nodoMasCercano devuelve null a más de 300 m', () => {
    expect(nodoMasCercano(grafo, [-100.29, 25.68])).toBeNull()
  })

  it('acepta otra distancia máxima', () => {
    expect(nodoMasCercano(grafo, [-100.29, 25.68], 2000)).toBe('5')
  })

  it('en un grafo vacío devuelve null', () => {
    expect(nodoMasCercano({ nodos: {}, aristas: [] }, [-100.3, 25.67])).toBeNull()
  })
})

describe('integración con calcularRutaEvacuacion', () => {
  it('el grafo construido funciona con calcularRutaEvacuacion', () => {
    const { grafo, puntosReunion } = construirZonaEvacuacion(elementosOverpassEjemplo)
    const origen = nodoMasCercano(grafo, [-100.3099, 25.6701])

    const resultado = calcularRutaEvacuacion(grafo, origen, puntosReunion.map((p) => p.nodoId), null)

    // Calculado a mano: n1 → n2 → n3 cuesta 1002 m × 1.1 = 1102.4
    // y n1 → n2 → n4 cuesta 501 m × 1.1 + 556 m × 1.0 (banqueta) = 1107.2: gana el 3 por poco
    expect(resultado.estado).toBe('ok')
    expect(resultado.refugioId).toBe('3')
    expect(resultado.nodos).toEqual(['1', '2', '3'])
  })
})
