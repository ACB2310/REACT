// DATOS DE EJEMPLO SOLO PARA PRUEBAS – no usar en producción
// Redes pequeñas de calles dentro de BBOX_MEXICO para probar calcularRutaEvacuacion
// con sismosEjemplo (gro1 = M 6.3 en [-99.9, 17.0]). Coordenadas en [longitud, latitud].
// Las distancias de los comentarios se calcularon a mano con haversine.

function nodo(id, coordenadas) {
  return { id, coordenadas }
}

function arista(desde, hasta, { tipoVia = 'residential', vulnerabilidad = 0.1 } = {}) {
  return { id: `${desde}-${hasta}`, desde, hasta, tipoVia, vulnerabilidad }
}

function crearGrafo(nodos, aristas) {
  return { nodos: Object.fromEntries(nodos.map((n) => [n.id, n])), aristas }
}

// Monterrey, lejos de todos los sismos de ejemplo (~965 km de gro1).
// m1 (origen) → m2 → m4 (refugio): 501.1 + 501.1 = 1002 m
// m1 → m3 → m5 (refugio): 556 + 1112 = 1668 m
export const grafoMonterrey = crearGrafo(
  [
    nodo('m1', [-100.31, 25.67]),
    nodo('m2', [-100.305, 25.67]),
    nodo('m3', [-100.31, 25.675]),
    nodo('m4', [-100.3, 25.67]),
    nodo('m5', [-100.31, 25.685]),
  ],
  [arista('m1', 'm2'), arista('m2', 'm4'), arista('m1', 'm3'), arista('m3', 'm5')],
)

// Acapulco: el camino directo pasa a 5.56 km de gro1 (dentro del radio crítico de 11.17 km).
// Directo a1 → a2 → a4: 21 535 + 21 535 = 43 070 m (bloqueado con gro1)
// Por el sur a1 → a3 → a4: 25 120 + 25 120 = 50 240 m (a 18.84 km de gro1: factor ≈ 1.821)
export const grafoAcapulco = crearGrafo(
  [
    nodo('a1', [-99.7, 16.92]),
    nodo('a2', [-99.9, 16.95]),
    nodo('a3', [-99.9, 16.8]),
    nodo('a4', [-100.1, 16.92]),
  ],
  [arista('a1', 'a2'), arista('a2', 'a4'), arista('a1', 'a3'), arista('a3', 'a4')],
)

// Dos refugios: c2 está a 3.3 km de gro1 (zona crítica); c3 queda fuera.
// c1 → c2: 14 605 m (bloqueado con gro1); c1 → c3: 23 069 m (factor ≈ 1.947)
export const grafoDosRefugios = crearGrafo(
  [nodo('c1', [-99.8, 16.88]), nodo('c2', [-99.9, 16.97]), nodo('c3', [-99.6, 16.8])],
  [arista('c1', 'c2'), arista('c1', 'c3')],
)

// Puente: p1 → p2 directo por un puente (1002 m, vulnerabilidad 0.6 → costo ≈ 1603)
// contra p1 → p3 → p2 por calles normales (528 + 528 = 1056 m, vulnerabilidad 0.1 → costo ≈ 1162)
export const grafoPuente = crearGrafo(
  [nodo('p1', [-100.31, 25.7]), nodo('p2', [-100.3, 25.7]), nodo('p3', [-100.305, 25.7015])],
  [
    // Puente (bridge=yes): vulnerabilidad residencial 0.1 + 0.5
    arista('p1', 'p2', { tipoVia: 'residential', vulnerabilidad: 0.6 }),
    arista('p1', 'p3'),
    arista('p3', 'p2'),
  ],
)

// Monterrey más un nodo x1 sin ninguna calle
export const grafoAislado = crearGrafo(
  [...Object.values(grafoMonterrey.nodos), nodo('x1', [-100.32, 25.69])],
  [...grafoMonterrey.aristas],
)

// Bloqueo de ejemplo: un cuadrito sobre la calle m1-m2 (en su punto medio [-100.3075, 25.67])
export function bloqueoSobreM1M2(tipo) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-100.3085, 25.669],
          [-100.3065, 25.669],
          [-100.3065, 25.671],
          [-100.3085, 25.671],
          [-100.3085, 25.669],
        ],
      ],
    },
    properties: { tipo },
  }
}

// Bloqueo de ejemplo sobre la calle c1-c3 (punto medio [-99.7, 16.84])
export const bloqueoTotalSobreC1C3 = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[[-99.71, 16.83], [-99.69, 16.83], [-99.69, 16.85], [-99.71, 16.85], [-99.71, 16.83]]],
  },
  properties: { tipo: 'total' },
}
