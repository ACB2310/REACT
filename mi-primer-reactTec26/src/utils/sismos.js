import { dentroDeCaja } from './geo.js'

// Caja que rodea a México: [oeste, sur, este, norte] en grados.
// Incluye un poco de EE. UU. y Centroamérica ("México y alrededores").
export const BBOX_MEXICO = [-118.5, 14.0, -86.0, 33.0]

// Rangos de magnitud, del más fuerte al más débil.
// Se usan para pintar los círculos del mapa y para la leyenda.
export const UMBRALES_MAGNITUD = [
  { min: 6, color: '#dc2626', etiqueta: '6.0 o más' },
  { min: 4, color: '#f97316', etiqueta: '4.0 a 5.9' },
  { min: 0, color: '#eab308', etiqueta: 'menos de 4.0' },
]

// Devuelve una colección nueva solo con los sismos dentro de BBOX_MEXICO.
// Ojo: GeoJSON usa [longitud, latitud], en ese orden.
export function filtrarSismosMexico(coleccion) {
  const features = coleccion.features.filter((sismo) =>
    dentroDeCaja(sismo.geometry?.coordinates, BBOX_MEXICO),
  )
  return { ...coleccion, features }
}

// Expresión de MapLibre que elige el color según la propiedad "mag".
// Si "mag" viene vacía se toma como 0 (el color más claro).
export function expresionColorMagnitud() {
  const [masDebil, ...resto] = [...UMBRALES_MAGNITUD].reverse()
  const pasos = resto.flatMap((umbral) => [umbral.min, umbral.color])
  return ['step', ['coalesce', ['get', 'mag'], 0], masDebil.color, ...pasos]
}

// Texto corto de magnitud: 5.234 → "M 5.2"; null → "M ?"
export function etiquetaMagnitud(mag) {
  if (typeof mag !== 'number' || Number.isNaN(mag)) return 'M ?'
  return `M ${mag.toFixed(1)}`
}

// Copia la profundidad (tercera coordenada) a `properties.profundidadKm`.
// Hace falta porque MapLibre solo conserva [longitud, latitud] al dibujar,
// y al tocar un sismo la profundidad ya no vendría en las coordenadas.
export function agregarProfundidad(coleccion) {
  const features = coleccion.features.map((sismo) => {
    const profundidad = sismo.geometry?.coordinates?.[2]
    return {
      ...sismo,
      properties: {
        ...sismo.properties,
        profundidadKm: typeof profundidad === 'number' ? profundidad : null,
      },
    }
  })
  return { ...coleccion, features }
}
