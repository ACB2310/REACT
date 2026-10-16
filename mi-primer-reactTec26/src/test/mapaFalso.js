// Utilidades SOLO PARA PRUEBAS: imitan lo que hace MapLibre sin necesitar WebGL.
import { vi } from 'vitest'

// Mapa falso que guarda fuentes, capas (en orden) y manejadores como lo haría MapLibre.
// `capasEstilo` simula las capas del mapa base, por ejemplo [{ id: 'nombres', type: 'symbol' }].
export function crearMapaFalso({ capasEstilo = [] } = {}) {
  const fuentes = {}
  const capas = {}
  const orden = []
  const manejadores = {}
  for (const capa of capasEstilo) {
    capas[capa.id] = capa
    orden.push(capa.id)
  }
  return {
    fuentes,
    capas,
    orden,
    manejadores,
    addSource: vi.fn((id, definicion) => {
      fuentes[id] = { definicion, setData: vi.fn(), setTiles: vi.fn() }
    }),
    getSource: vi.fn((id) => fuentes[id]),
    removeSource: vi.fn((id) => {
      delete fuentes[id]
    }),
    // Como MapLibre: si se indica `antesDe` y existe, la capa queda debajo de ella
    addLayer: vi.fn((capa, antesDe) => {
      capas[capa.id] = { ...capa, layout: { ...capa.layout } }
      const posicion = antesDe ? orden.indexOf(antesDe) : -1
      if (posicion >= 0) orden.splice(posicion, 0, capa.id)
      else orden.push(capa.id)
    }),
    getLayer: vi.fn((id) => capas[id]),
    removeLayer: vi.fn((id) => {
      delete capas[id]
      orden.splice(orden.indexOf(id), 1)
    }),
    setLayoutProperty: vi.fn((id, propiedad, valor) => {
      capas[id].layout[propiedad] = valor
    }),
    getStyle: vi.fn(() => ({ layers: orden.map((id) => capas[id]) })),
    // MapLibre acepta on(evento, manejador) y on(evento, idCapa, manejador)
    on: vi.fn((evento, capaOManejador, manejador) => {
      if (manejador) manejadores[`${evento}:${capaOManejador}`] = manejador
      else manejadores[evento] = capaOManejador
    }),
    off: vi.fn((evento, capaOManejador, manejador) => {
      if (manejador) delete manejadores[`${evento}:${capaOManejador}`]
      else delete manejadores[evento]
    }),
  }
}

// Simula que MapLibre cambió de estilo: borra fuentes y capas propias y avisa con 'style.load'
export function simularCambioDeEstilo(mapa, idsPropios) {
  for (const id of idsPropios) {
    delete mapa.fuentes[id]
    if (mapa.capas[id]) mapa.removeLayer(id)
  }
  mapa.manejadores['style.load']()
}

// MapLibre no entrega el GeoJSON original al hacer clic: solo [lon, lat]
// y sin las propiedades que valen null
export function comoLoDevuelveMapLibre(feature) {
  const [longitud, latitud] = feature.geometry.coordinates
  const properties = Object.fromEntries(
    Object.entries(feature.properties).filter(([, valor]) => valor !== null),
  )
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [longitud, latitud] }, properties }
}
