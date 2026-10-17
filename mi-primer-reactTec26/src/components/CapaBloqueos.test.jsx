import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import CapaBloqueos from './CapaBloqueos.jsx'
import CapaRefugios from './CapaRefugios.jsx'
import { popups } from '../test/maplibreFalso.js'
import { crearMapaFalso } from '../test/mapaFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))

function bloqueo(propiedades) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-103.35, 20.67] },
    properties: {
      id: 10,
      tipo: 'total',
      esAnonimo: true,
      confirmado: false,
      esMio: false,
      creadoEn: Date.now(),
      // 3 h y 5 min: así sigue diciendo "3 h" aunque la prueba tarde unos milisegundos
      expiraEn: Date.now() + 3 * 3600000 + 5 * 60000,
      ...propiedades,
    },
  }
}
const COLECCION = { type: 'FeatureCollection', features: [bloqueo()] }

function tocar(mapa, feature) {
  mapa.manejadores['click:bloqueos-toque']({ features: [feature] })
  return popups.at(-1)
}

function botones(popup) {
  return [...popup.contenido.querySelectorAll('button')].map((b) => b.textContent)
}

describe('CapaBloqueos', () => {
  beforeEach(() => {
    popups.length = 0
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('agrega fuentes y capas, y los bloqueos quedan arriba de sismos y refugios', () => {
    const mapa = crearMapaFalso({ capasEstilo: [{ id: 'sismos-circulos', type: 'circle' }] })
    render(
      <>
        <CapaRefugios mapa={mapa} refugios={null} />
        <CapaBloqueos mapa={mapa} bloqueos={COLECCION} />
      </>,
    )

    expect(mapa.fuentes.bloqueos.definicion).toEqual({ type: 'geojson', data: COLECCION })
    expect(mapa.orden).toEqual(['sismos-circulos', 'refugios-puntos', 'refugios-toque', 'bloqueos-puntos', 'bloqueos-toque'])
  })

  it('el popup dice el tipo y no muestra botones a quien no reportó', () => {
    const mapa = crearMapaFalso()
    render(<CapaBloqueos mapa={mapa} bloqueos={COLECCION} rol="ciudadano" />)

    const popup = tocar(mapa, bloqueo({ tipo: 'solo_vehiculos' }))

    expect(popup.lngLat).toEqual([-103.35, 20.67])
    expect(popup.contenido.textContent).toContain('Bloqueo parcial')
    expect(popup.contenido.textContent).toContain('Se puede pasar a pie')
    expect(popup.contenido.textContent).toContain('Reporte anónimo · Sin confirmar')
    expect(popup.contenido.textContent).toContain('Vence en 3 h')
    expect(botones(popup)).toEqual([])
  })

  it('muestra Renovar y Eliminar en un bloqueo propio', () => {
    const mapa = crearMapaFalso()
    render(<CapaBloqueos mapa={mapa} bloqueos={COLECCION} rol="ciudadano" />)

    expect(botones(tocar(mapa, bloqueo({ esMio: true })))).toEqual(['Renovar 24 h', 'Eliminar'])
  })

  it('un brigadista ve los botones en bloqueos ajenos', () => {
    const mapa = crearMapaFalso()
    render(<CapaBloqueos mapa={mapa} bloqueos={COLECCION} rol="brigadista" />)

    expect(botones(tocar(mapa, bloqueo()))).toEqual(['Renovar 24 h', 'Eliminar'])
  })

  it('Renovar llama alRenovar(id) y cierra el popup', async () => {
    const mapa = crearMapaFalso()
    const alRenovar = vi.fn().mockResolvedValue(undefined)
    render(<CapaBloqueos mapa={mapa} bloqueos={COLECCION} rol="ciudadano" alRenovar={alRenovar} />)

    const popup = tocar(mapa, bloqueo({ esMio: true }))
    popup.contenido.querySelector('button').click()

    expect(alRenovar).toHaveBeenCalledWith(10)
    await vi.waitFor(() => expect(popup.abierto).toBe(false))
  })

  it('si falla, muestra el error en el popup y deja reintentar', async () => {
    const mapa = crearMapaFalso()
    const alRenovar = vi.fn().mockRejectedValue(new Error('No tienes permiso para hacer esto.'))
    render(<CapaBloqueos mapa={mapa} bloqueos={COLECCION} rol="ciudadano" alRenovar={alRenovar} />)

    const popup = tocar(mapa, bloqueo({ esMio: true }))
    const boton = popup.contenido.querySelector('button')
    boton.click()

    await vi.waitFor(() => expect(popup.contenido.textContent).toContain('No tienes permiso para hacer esto.'))
    expect(boton.disabled).toBe(false)
    expect(popup.abierto).toBe(true)
  })

  it('Eliminar pide confirmación y no hace nada si la persona cancela', async () => {
    const mapa = crearMapaFalso()
    const alEliminar = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CapaBloqueos mapa={mapa} bloqueos={COLECCION} rol="coordinador" alEliminar={alEliminar} />)

    const popup = tocar(mapa, bloqueo())
    popup.contenido.querySelectorAll('button')[1].click()

    await vi.waitFor(() => expect(popup.contenido.querySelectorAll('button')[1].disabled).toBe(false))
    expect(window.confirm).toHaveBeenCalledWith('¿Eliminar este bloqueo?')
    expect(alEliminar).not.toHaveBeenCalled()
  })

  it('la descripción no se interpreta como HTML', () => {
    const mapa = crearMapaFalso()
    render(<CapaBloqueos mapa={mapa} bloqueos={COLECCION} />)

    const popup = tocar(mapa, bloqueo({ descripcion: '<img src=x onerror="alert(1)">' }))

    expect(popup.contenido.querySelector('img')).toBeNull()
    expect(popup.contenido.textContent).toContain('<img src=x onerror="alert(1)">')
  })

  it('oculta los bloqueos con visible false', () => {
    const mapa = crearMapaFalso()
    render(<CapaBloqueos mapa={mapa} bloqueos={COLECCION} visible={false} />)
    expect(mapa.capas['bloqueos-puntos'].layout.visibility).toBe('none')
  })
})

describe('CapaRefugios', () => {
  beforeEach(() => {
    popups.length = 0
  })

  it('el popup muestra nombre, ocupación, estado y fuente', () => {
    const mapa = crearMapaFalso()
    render(<CapaRefugios mapa={mapa} refugios={{ type: 'FeatureCollection', features: [] }} />)

    mapa.manejadores['click:refugios-toque']({
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-103.35, 20.67] },
          properties: {
            nombre: 'Escuela Benito Juárez',
            municipio: 'Guadalajara',
            entidad: 'Jalisco',
            estado: 'lleno',
            ocupacion: 120,
            capacidad: 120,
            fuente: 'Protección Civil',
            actualizadoEn: Date.UTC(2026, 9, 16, 18, 0),
          },
        },
      ],
    })
    const texto = popups.at(-1).contenido.textContent

    expect(texto).toContain('Escuela Benito Juárez')
    expect(texto).toContain('Guadalajara, Jalisco')
    expect(texto).toContain('Estado: Lleno')
    expect(texto).toContain('120 de 120 lugares ocupados')
    expect(texto).toContain('Fuente: Protección Civil')
  })
})
