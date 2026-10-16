import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCapasMapa } from './useCapasMapa.js'
import { crearMapaFalso, simularCambioDeEstilo } from '../test/mapaFalso.js'

const VACIA = { type: 'FeatureCollection', features: [] }
const IDS_PROPIOS = ['prueba', 'prueba-relleno', 'prueba-borde']

// Configuración de ejemplo: una fuente con dos capas y un clic
function crearConfiguracion(datos = VACIA, extra = {}) {
  return {
    fuentes: [{ id: 'prueba', definicion: () => ({ type: 'geojson', data: datos }) }],
    capas: [
      { id: 'prueba-relleno', type: 'fill', source: 'prueba' },
      { id: 'prueba-borde', type: 'line', source: 'prueba' },
    ],
    clics: { 'prueba-relleno': vi.fn() },
    ...extra,
  }
}

describe('useCapasMapa', () => {
  it('no hace nada si mapa es null', () => {
    expect(() => renderHook(() => useCapasMapa(null, crearConfiguracion()))).not.toThrow()
  })

  it('agrega fuentes y capas en orden', () => {
    const mapa = crearMapaFalso()
    renderHook(() => useCapasMapa(mapa, crearConfiguracion()))

    expect(mapa.fuentes.prueba.definicion).toEqual({ type: 'geojson', data: VACIA })
    expect(mapa.orden).toEqual(['prueba-relleno', 'prueba-borde'])
  })

  it('inserta debajo de antesDe si esa capa existe y no se lo pasa a MapLibre', () => {
    const mapa = crearMapaFalso({ capasEstilo: [{ id: 'sismos-circulos', type: 'circle' }] })
    const configuracion = crearConfiguracion(VACIA, {
      capas: [{ id: 'prueba-relleno', type: 'fill', source: 'prueba', antesDe: 'sismos-circulos' }],
    })
    renderHook(() => useCapasMapa(mapa, configuracion))

    expect(mapa.addLayer).toHaveBeenCalledWith(
      { id: 'prueba-relleno', type: 'fill', source: 'prueba' },
      'sismos-circulos',
    )
    expect(mapa.orden).toEqual(['prueba-relleno', 'sismos-circulos'])
  })

  it('acepta antesDe como función del mapa', () => {
    const mapa = crearMapaFalso({
      capasEstilo: [
        { id: 'calles', type: 'line' },
        { id: 'nombres', type: 'symbol' },
      ],
    })
    const configuracion = crearConfiguracion(VACIA, {
      capas: [{ id: 'prueba-relleno', type: 'fill', source: 'prueba', antesDe: () => 'nombres' }],
    })
    renderHook(() => useCapasMapa(mapa, configuracion))

    expect(mapa.orden).toEqual(['calles', 'prueba-relleno', 'nombres'])
  })

  it('va hasta arriba si antesDe no existe', () => {
    const mapa = crearMapaFalso({ capasEstilo: [{ id: 'calles', type: 'line' }] })
    const configuracion = crearConfiguracion(VACIA, {
      capas: [{ id: 'prueba-relleno', type: 'fill', source: 'prueba', antesDe: 'sismos-circulos' }],
    })
    renderHook(() => useCapasMapa(mapa, configuracion))

    expect(mapa.orden).toEqual(['calles', 'prueba-relleno'])
  })

  it('registra los clics por capa', () => {
    const mapa = crearMapaFalso()
    const configuracion = crearConfiguracion()
    renderHook(() => useCapasMapa(mapa, configuracion))

    mapa.manejadores['click:prueba-relleno']({ features: [] })
    expect(configuracion.clics['prueba-relleno']).toHaveBeenCalledTimes(1)
  })

  it('vuelve a agregar todo en style.load con datos frescos', () => {
    const mapa = crearMapaFalso()
    const frescos = { type: 'FeatureCollection', features: [{ type: 'Feature' }] }
    const { rerender } = renderHook(({ datos }) => useCapasMapa(mapa, crearConfiguracion(datos)), {
      initialProps: { datos: VACIA },
    })
    rerender({ datos: frescos })

    simularCambioDeEstilo(mapa, IDS_PROPIOS)

    expect(mapa.fuentes.prueba.definicion.data).toBe(frescos)
    expect(mapa.orden).toEqual(['prueba-relleno', 'prueba-borde'])
    expect(mapa.addSource).toHaveBeenCalledTimes(2)
  })

  it('oculta y muestra todas sus capas con visible', () => {
    const mapa = crearMapaFalso()
    const { rerender } = renderHook(
      ({ visible }) => useCapasMapa(mapa, crearConfiguracion(VACIA, { visible })),
      { initialProps: { visible: true } },
    )
    expect(mapa.capas['prueba-borde'].layout.visibility).toBe('visible')

    rerender({ visible: false })
    expect(mapa.capas['prueba-relleno'].layout.visibility).toBe('none')
    expect(mapa.capas['prueba-borde'].layout.visibility).toBe('none')
  })

  it('las capas que vuelven tras un cambio de estilo respetan visible false', () => {
    const mapa = crearMapaFalso()
    renderHook(() => useCapasMapa(mapa, crearConfiguracion(VACIA, { visible: false })))

    simularCambioDeEstilo(mapa, IDS_PROPIOS)
    expect(mapa.capas['prueba-relleno'].layout.visibility).toBe('none')
  })

  it('limpia todo al desmontar', () => {
    const mapa = crearMapaFalso()
    const { unmount } = renderHook(() => useCapasMapa(mapa, crearConfiguracion()))
    const manejadorEstilo = mapa.manejadores['style.load']

    unmount()

    expect(mapa.off).toHaveBeenCalledWith('style.load', manejadorEstilo)
    expect(mapa.manejadores['click:prueba-relleno']).toBeUndefined()
    expect(mapa.orden).toEqual([])
    expect(mapa.fuentes.prueba).toBeUndefined()
  })

  it('no falla al desmontar si el mapa ya se eliminó', () => {
    const mapa = crearMapaFalso()
    const { unmount } = renderHook(() => useCapasMapa(mapa, crearConfiguracion()))
    mapa.getLayer.mockImplementation(() => {
      throw new TypeError('el mapa ya no existe')
    })

    expect(() => unmount()).not.toThrow()
  })
})
