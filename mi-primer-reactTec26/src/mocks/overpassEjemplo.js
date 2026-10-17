// DATOS DE EJEMPLO SOLO PARA PRUEBAS – no usar en producción
// Imita la respuesta de Overpass con "out body geom" (calles) y "out qt" (puntos de reunión).
// OJO: Overpass entrega cada punto como { lat, lon }; la app lo convierte a [lon, lat].
//
// Mapa de las calles (en Monterrey):
//
//   n6 ──privada── n4 ──────────────── n5        (n4-n6: service con access=private)
//                  │ footway             │ puente (bridge=yes)
//   n7 ─foot=no─ n1 ─── n2 ──────────── n3       (n1-n2-n3: residential "Calle Hidalgo")

function via(id, tags, puntos) {
  const lats = puntos.map(([, , lat]) => lat)
  const lons = puntos.map(([, lon]) => lon)
  return {
    type: 'way',
    id,
    bounds: { minlat: Math.min(...lats), minlon: Math.min(...lons), maxlat: Math.max(...lats), maxlon: Math.max(...lons) },
    nodes: puntos.map(([nodo]) => nodo),
    geometry: puntos.map(([, lon, lat]) => ({ lat, lon })),
    tags,
  }
}

function puntoReunion(id, lon, lat, nombre) {
  return {
    type: 'node',
    id,
    lat,
    lon,
    tags: nombre ? { emergency: 'assembly_point', name: nombre } : { emergency: 'assembly_point' },
  }
}

// Cada punto de una vía: [idNodo, longitud, latitud]
const N1 = [1, -100.31, 25.67]
const N2 = [2, -100.305, 25.67]
const N3 = [3, -100.3, 25.67]
const N4 = [4, -100.305, 25.675]
const N5 = [5, -100.3, 25.675]
const N6 = [6, -100.31, 25.675]
const N7 = [7, -100.315, 25.67]

export const elementosOverpassEjemplo = [
  via(100, { highway: 'residential', name: 'Calle Hidalgo' }, [N1, N2, N3]),
  via(101, { highway: 'footway' }, [N2, N4]),
  via(102, { highway: 'residential', bridge: 'yes', name: 'Puente Juárez' }, [N3, N5]),
  via(103, { highway: 'service', access: 'private' }, [N4, N6]),
  via(104, { highway: 'residential', foot: 'no' }, [N7, N1]),
  // A ~25 m del nodo 3
  puntoReunion(900, -100.3001, 25.6702, 'Plaza Hidalgo'),
  // Sin nombre, a ~10 m del nodo 4
  puntoReunion(902, -100.3051, 25.6751),
  // A más de 1 km de cualquier calle: se descarta
  puntoReunion(901, -100.29, 25.68, 'Parque lejano'),
]
