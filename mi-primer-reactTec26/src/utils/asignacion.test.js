import { describe, it, expect } from 'vitest'
import {
  sugerirAsignaciones,
  brigadasDisponiblesPorDistancia,
  incidentesCercanos,
  textoDistancia,
} from './asignacion.js'
import { etiquetaPrioridad, enlaceAbrirEnMapas, textoAntiguedad, expresionColorPrioridad } from './incidentes.js'

// Puntos sobre una línea de Guadalajara: cada 0.01° de longitud son ~1 km
function incidente(id, prioridad, longitud, { estado = 'pendiente', creadoEn = 0, tipo = 'rescate' } = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [longitud, 20.67] },
    properties: { id, prioridad, estado, creadoEn, tipo },
  }
}
function brigada(id, longitud, estado = 'disponible') {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [longitud, 20.67] },
    properties: { id, estado },
  }
}

describe('sugerirAsignaciones', () => {
  it('el incidente de prioridad 1 recibe la brigada más cercana aunque otro esté más cerca de ella', () => {
    // La brigada 10 está en -103.30. El incidente 2 (prioridad 3) está justo encima de ella,
    // pero el 1 (prioridad 1) va primero y también le queda más cerca que la brigada 20.
    const sugerencias = sugerirAsignaciones(
      [incidente(2, 3, -103.30), incidente(1, 1, -103.32)],
      [brigada(10, -103.30), brigada(20, -103.40)],
    )

    expect(sugerencias.map((s) => [s.incidenteId, s.brigadaId])).toEqual([
      [1, 10],
      [2, 20],
    ])
  })

  it('nunca sugiere la misma brigada dos veces', () => {
    const sugerencias = sugerirAsignaciones(
      [incidente(1, 1, -103.30), incidente(2, 1, -103.301), incidente(3, 1, -103.302)],
      [brigada(10, -103.30), brigada(20, -103.50), brigada(30, -103.60)],
    )
    const brigadas = sugerencias.map((s) => s.brigadaId)
    expect(new Set(brigadas).size).toBe(3)
  })

  it('ignora brigadas ocupadas o fuera de servicio, e incidentes que ya tienen brigada', () => {
    const sugerencias = sugerirAsignaciones(
      [incidente(1, 1, -103.30), incidente(2, 1, -103.30, { estado: 'asignado' })],
      [brigada(10, -103.30, 'en_camino'), brigada(20, -103.30, 'fuera_de_servicio'), brigada(30, -103.50)],
    )
    expect(sugerencias).toEqual([{ incidenteId: 1, brigadaId: 30, distanciaKm: expect.any(Number) }])
  })

  it('con más incidentes que brigadas, los menos urgentes quedan sin brigada', () => {
    const sugerencias = sugerirAsignaciones(
      [incidente(1, 5, -103.30), incidente(2, 1, -103.31)],
      [brigada(10, -103.30)],
    )
    expect(sugerencias).toEqual([
      { incidenteId: 2, brigadaId: 10, distanciaKm: expect.any(Number) },
      { incidenteId: 1, brigadaId: null, distanciaKm: null },
    ])
  })

  it('a igual prioridad va primero el más viejo', () => {
    const sugerencias = sugerirAsignaciones(
      [incidente(1, 2, -103.30, { creadoEn: 2000 }), incidente(2, 2, -103.30, { creadoEn: 1000 })],
      [brigada(10, -103.30)],
    )
    expect(sugerencias[0]).toMatchObject({ incidenteId: 2, brigadaId: 10 })
  })

  it('calcula la distancia en km con [longitud, latitud]', () => {
    const [sugerencia] = sugerirAsignaciones([incidente(1, 1, -103.30)], [brigada(10, -103.40)])
    // 0.1° de longitud a 20.67° de latitud ≈ 10.4 km
    expect(sugerencia.distanciaKm).toBeGreaterThan(10)
    expect(sugerencia.distanciaKm).toBeLessThan(11)
  })

  it('listas vacías', () => {
    expect(sugerirAsignaciones([], [])).toEqual([])
    expect(sugerirAsignaciones([incidente(1, 1, -103.3)], [])).toEqual([
      { incidenteId: 1, brigadaId: null, distanciaKm: null },
    ])
  })
})

describe('brigadasDisponiblesPorDistancia', () => {
  it('solo disponibles, de la más cercana a la más lejana', () => {
    const lista = brigadasDisponiblesPorDistancia(
      [-103.30, 20.67],
      [brigada(10, -103.50), brigada(20, -103.31), brigada(30, -103.30, 'asignada')],
    )
    expect(lista.map((x) => x.brigada.properties.id)).toEqual([20, 10])
  })
})

describe('incidentesCercanos', () => {
  it('encuentra un abierto del mismo tipo a 150 m o menos', () => {
    const lista = [
      incidente(1, 1, -103.3001),
      incidente(2, 1, -103.3001, { tipo: 'incendio' }),
      incidente(3, 1, -103.3001, { estado: 'atendido' }),
      incidente(4, 1, -103.32),
    ]
    const cercanos = incidentesCercanos([-103.30, 20.67], 'rescate', lista)
    expect(cercanos.map((c) => c.incidente.properties.id)).toEqual([1])
    expect(cercanos[0].metros).toBeLessThan(15)
  })
})

describe('textos', () => {
  it('prioridad, distancia y antigüedad', () => {
    expect(etiquetaPrioridad(1)).toBe('1 · Crítica')
    expect(etiquetaPrioridad(9)).toBe('Prioridad desconocida')
    expect(textoDistancia(0.85)).toBe('850 m')
    expect(textoDistancia(3.24)).toBe('3.2 km')
    expect(textoAntiguedad(0, 5 * 60000)).toBe('hace 5 min')
    expect(textoAntiguedad(0, 3 * 3600000)).toBe('hace 3 h')
    expect(textoAntiguedad(0, 49 * 3600000)).toBe('hace 2 días')
  })

  it('el enlace de mapas usa latitud,longitud', () => {
    expect(enlaceAbrirEnMapas([-103.36, 20.68])).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=20.68,-103.36',
    )
  })

  it('el color por prioridad tiene un caso por cada nivel', () => {
    const expresion = expresionColorPrioridad()
    expect(expresion.slice(0, 2)).toEqual(['match', ['get', 'prioridad']])
    expect(expresion).toContain(1)
    expect(expresion).toContain(5)
  })
})
