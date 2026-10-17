// Reemplazo de 'maplibre-gl' SOLO PARA PRUEBAS: guarda cada Popup que se crea.
// Uso: vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))
export const popups = []

export class Popup {
  constructor(opciones) {
    this.opciones = opciones
    popups.push(this)
  }
  setLngLat(coordenadas) {
    this.lngLat = coordenadas
    return this
  }
  setDOMContent(elemento) {
    this.contenido = elemento
    return this
  }
  addTo(mapa) {
    this.mapa = mapa
    this.abierto = true
    return this
  }
  remove() {
    this.abierto = false
    return this
  }
}

// Marcador falso: guarda su posición y permite simular que lo arrastran
export const marcadores = []

export class Marker {
  constructor(opciones) {
    this.opciones = opciones
    this.manejadores = {}
    marcadores.push(this)
  }
  setLngLat(coordenadas) {
    this.lngLat = coordenadas
    return this
  }
  getLngLat() {
    const [lng, lat] = this.lngLat
    return { lng, lat }
  }
  addTo(mapa) {
    this.mapa = mapa
    this.agregado = true
    return this
  }
  on(evento, manejador) {
    this.manejadores[evento] = manejador
    return this
  }
  remove() {
    this.agregado = false
    return this
  }
}
