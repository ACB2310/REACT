import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import CapaRutasEvacuacion from './CapaRutasEvacuacion.jsx'
import { crearMapaFalso } from '../test/mapaFalso.js'

const VACIA = { type: 'FeatureCollection', features: [] }
const ORIGEN = [-100.3099, 25.6701]
const DESTINO = [-100.3001, 25.6702]
const RUTA = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[-100.31, 25.67], [-100.305, 25.67], [-100.3, 25.67]] },
  properties: { refugioId: '3', distanciaM: 1002, nivelRiesgo: 'bajo' },
}

// Mapa falso con capas de otras partes de la app y fitBounds
function crearMapa() {
  const mapa = crearMapaFalso({
    capasEstilo: [
      { id: 'calles', type: 'line' },
      { id: 'sismos-circulos', type: 'circle' },
      { id: 'sismos-toque', type: 'circle' },
    ],
  })
  mapa.fitBounds = vi.fn()
  return mapa
}

describe('CapaRutasEvacuacion', () => {
  it('no hace nada si mapa es null', () => {
    expect(() => render(<CapaRutasEvacuacion mapa={null} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)).not.toThrow()
  })

  it('dibuja la ruta con el color de su riesgo', () => {
    const mapa = crearMapa()
    render(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)

    expect(mapa.fuentes['evacuacion-ruta'].definicion).toEqual({ type: 'geojson', data: RUTA })
    expect(mapa.capas['evacuacion-ruta'].paint['line-color']).toEqual([
      'match', ['get', 'nivelRiesgo'],
      'bajo', '#16a34a',
      'medio', '#f59e0b',
      'alto', '#dc2626',
      '#6b7280',
    ])
    expect(mapa.capas['evacuacion-ruta'].paint['line-width']).toBe(5)
    expect(mapa.capas['evacuacion-ruta-borde'].paint).toMatchObject({ 'line-color': '#ffffff', 'line-width': 9 })
  })

  it('marca origen y destino', () => {
    const mapa = crearMapa()
    render(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)

    expect(mapa.fuentes['evacuacion-puntos'].definicion.data).toEqual({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: ORIGEN }, properties: { rol: 'origen' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: DESTINO }, properties: { rol: 'destino' } },
      ],
    })
    expect(mapa.capas['evacuacion-puntos'].paint['circle-color']).toEqual([
      'match', ['get', 'rol'], 'origen', '#2563eb', 'destino', '#16a34a', '#6b7280',
    ])
  })

  it('va encima de las demás capas', () => {
    const mapa = crearMapa()
    render(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)

    expect(mapa.orden.slice(-3)).toEqual(['evacuacion-ruta-borde', 'evacuacion-ruta', 'evacuacion-puntos'])
  })

  it('encuadra la ruta al llegar', () => {
    const mapa = crearMapa()
    render(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)

    // [[oeste, sur], [este, norte]] incluyendo la ruta, el origen y el destino
    expect(mapa.fitBounds).toHaveBeenCalledWith(
      [
        [-100.31, 25.67],
        [-100.3, 25.6702],
      ],
      { padding: 48, maxZoom: 17 },
    )
  })

  it('no vuelve a encuadrar si la ruta no cambió', () => {
    const mapa = crearMapa()
    const { rerender } = render(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)
    rerender(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)
    expect(mapa.fitBounds).toHaveBeenCalledTimes(1)
  })

  // El hook recalcula la ruta cada vez que llegan sismos nuevos: si el trazo es el mismo,
  // el mapa no debe saltar mientras la persona lo mira
  it('no encuadra otra vez si solo se recalculó con el mismo trazo', () => {
    const mapa = crearMapa()
    const { rerender } = render(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)
    const recalculada = { ...RUTA, properties: { ...RUTA.properties, nivelRiesgo: 'medio' } }
    rerender(<CapaRutasEvacuacion mapa={mapa} ruta={recalculada} origen={ORIGEN} destino={DESTINO} />)

    expect(mapa.fitBounds).toHaveBeenCalledTimes(1)
    expect(mapa.fuentes['evacuacion-ruta'].setData).toHaveBeenLastCalledWith(recalculada)
  })

  it('actualiza los datos cuando llega una ruta nueva', () => {
    const mapa = crearMapa()
    const { rerender } = render(<CapaRutasEvacuacion mapa={mapa} ruta={null} origen={null} destino={null} />)
    rerender(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)

    expect(mapa.fuentes['evacuacion-ruta'].setData).toHaveBeenLastCalledWith(RUTA)
    expect(mapa.fitBounds).toHaveBeenCalledTimes(1)
  })

  it('con ruta null vacía las fuentes', () => {
    const mapa = crearMapa()
    const { rerender } = render(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)
    rerender(<CapaRutasEvacuacion mapa={mapa} ruta={null} origen={null} destino={null} />)

    expect(mapa.fuentes['evacuacion-ruta'].setData).toHaveBeenLastCalledWith(VACIA)
    expect(mapa.fuentes['evacuacion-puntos'].setData).toHaveBeenLastCalledWith(VACIA)
  })

  // Tras un "sin ruta" el hook conserva el origen: un punto azul solo, sin ruta, confundiría
  it('sin ruta no dibuja los puntos aunque lleguen origen y destino', () => {
    const mapa = crearMapa()
    render(<CapaRutasEvacuacion mapa={mapa} ruta={null} origen={ORIGEN} destino={DESTINO} />)
    expect(mapa.fuentes['evacuacion-puntos'].definicion.data).toEqual(VACIA)
  })

  // Para quien no distingue bien los colores: el destino se ve más grande que el origen
  it('el punto de reunión se dibuja más grande que la persona', () => {
    const mapa = crearMapa()
    render(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)
    expect(mapa.capas['evacuacion-puntos'].paint['circle-radius']).toEqual(['match', ['get', 'rol'], 'destino', 12, 8])
  })

  it('una ruta sin geometría no rompe la pantalla', () => {
    const mapa = crearMapa()
    const rota = { type: 'Feature', geometry: null, properties: {} }
    expect(() => render(<CapaRutasEvacuacion mapa={mapa} ruta={rota} origen={ORIGEN} destino={DESTINO} />)).not.toThrow()
  })

  it('si encuadrar falla (mapa oculto o muy chico) no rompe la pantalla', () => {
    const mapa = crearMapa()
    mapa.fitBounds.mockImplementation(() => {
      throw new Error('cannot fit within canvas')
    })
    expect(() => render(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)).not.toThrow()
  })

  it('se quita al desmontar', () => {
    const mapa = crearMapa()
    const { unmount } = render(<CapaRutasEvacuacion mapa={mapa} ruta={RUTA} origen={ORIGEN} destino={DESTINO} />)
    unmount()
    expect(mapa.capas['evacuacion-ruta']).toBeUndefined()
    expect(mapa.fuentes['evacuacion-ruta']).toBeUndefined()
  })
})
