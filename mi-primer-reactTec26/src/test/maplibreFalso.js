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
    return this
  }
}
