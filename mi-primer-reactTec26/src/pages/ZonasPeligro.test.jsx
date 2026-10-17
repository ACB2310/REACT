import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import ZonasPeligro from './ZonasPeligro.jsx'
import { useZonasPeligro } from '../hooks/useZonasPeligro.js'
import { crearZona, desactivarZona } from '../services/zonas.js'
import { crearMapaFalso } from '../test/mapaFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))
vi.mock('../hooks/useZonasPeligro.js', () => ({ useZonasPeligro: vi.fn() }))
vi.mock('../services/zonas.js', () => ({ crearZona: vi.fn(), desactivarZona: vi.fn() }))
const { mapaFalso } = vi.hoisted(() => ({ mapaFalso: { actual: null } }))
vi.mock('../components/MapaBase.jsx', async () => {
  const { useEffect } = await import('react')
  return {
    default: function MapaBaseFalso({ alCargar }) {
      useEffect(() => {
        alCargar(mapaFalso.actual)
      }, [alCargar])
      return null
    },
  }
})

const ZONAS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-103.35, 20.67], [-103.34, 20.67], [-103.34, 20.68], [-103.35, 20.67]]] },
      properties: { id: 4, severidad: 1, descripcion: 'Fuga de gas', creadoEn: 1700000000000, expiraEn: null },
    },
  ],
}

let recargar
function tocar(lng, lat) {
  act(() => mapaFalso.actual.manejadores.click({ lngLat: { lng, lat } }))
}
const boton = (nombre) => screen.getByRole('button', { name: nombre })

describe('ZonasPeligro', () => {
  beforeEach(() => {
    mapaFalso.actual = crearMapaFalso()
    recargar = vi.fn()
    useZonasPeligro.mockReturnValue({ zonas: ZONAS, estado: 'listo', error: null, actualizadoEn: 1, recargar })
    crearZona.mockReset().mockResolvedValue(9)
    desactivarZona.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('se dibuja tocando el mapa y se guarda cerrada en [longitud, latitud]', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 17, 12))
    render(<ZonasPeligro />)
    expect(boton('Guardar zona')).toBeDisabled()

    tocar(-103.35, 20.67)
    tocar(-103.345, 20.67)
    expect(boton('Guardar zona')).toBeDisabled()
    tocar(-103.345, 20.675)
    expect(screen.getByText(/^3 puntos · 0\.\d\d km²$/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Descripción (opcional)'), { target: { value: ' Fuga ' } })
    fireEvent.change(screen.getByLabelText('Vigencia'), { target: { value: '6' } })
    await act(async () => fireEvent.click(boton('Guardar zona')))

    expect(crearZona).toHaveBeenCalledWith({
      anillo: [[-103.35, 20.67], [-103.345, 20.67], [-103.345, 20.675], [-103.35, 20.67]],
      severidad: 1,
      descripcion: 'Fuga',
      expiraEn: Date.UTC(2026, 9, 17, 18),
    })
    expect(screen.getByText('Zona guardada. Las rutas a refugio ya la toman en cuenta.')).toBeInTheDocument()
    expect(recargar).toHaveBeenCalledWith({ silencioso: true })
  })

  it('el dibujo se ve en el mapa como polígono cerrado', () => {
    render(<ZonasPeligro />)
    tocar(-103.35, 20.67)
    tocar(-103.345, 20.67)
    tocar(-103.345, 20.675)

    const datos = mapaFalso.actual.fuentes['dibujo-zona'].setData.mock.calls.at(-1)[0]
    expect(datos.features[0].geometry).toEqual({
      type: 'Polygon',
      coordinates: [[[-103.35, 20.67], [-103.345, 20.67], [-103.345, 20.675], [-103.35, 20.67]]],
    })
    expect(datos.features.filter((f) => f.geometry.type === 'Point')).toHaveLength(3)
  })

  it('Deshacer quita el último punto y Borrar todos', () => {
    render(<ZonasPeligro />)
    tocar(-103.35, 20.67)
    tocar(-103.345, 20.67)
    fireEvent.click(boton('Deshacer punto'))
    expect(screen.getByText('1 punto')).toBeInTheDocument()
    fireEvent.click(boton('Borrar'))
    expect(screen.getByText('Sin puntos todavía.')).toBeInTheDocument()
  })

  it('avisa y no deja guardar una zona de más de 20 km²', () => {
    render(<ZonasPeligro />)
    tocar(-103.40, 20.60)
    tocar(-103.30, 20.60)
    tocar(-103.30, 20.70)
    expect(screen.getByRole('alert')).toHaveTextContent('el máximo es 20 km²')
    expect(boton('Guardar zona')).toBeDisabled()
  })

  it('un error del servidor se muestra y conserva el dibujo', async () => {
    crearZona.mockRejectedValue(new Error('La zona no es válida: revisa que sus lados no se crucen.'))
    render(<ZonasPeligro />)
    tocar(-103.35, 20.67)
    tocar(-103.345, 20.675)
    tocar(-103.345, 20.67)
    tocar(-103.35, 20.675)
    await act(async () => fireEvent.click(boton('Guardar zona')))

    expect(screen.getByRole('alert')).toHaveTextContent('La zona no es válida')
    expect(screen.getByText(/^4 puntos/)).toBeInTheDocument()
  })

  it('lista las zonas activas y las desactiva con confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ZonasPeligro />)
    expect(screen.getByText('Fuga de gas')).toBeInTheDocument()

    await act(async () => fireEvent.click(boton('Desactivar')))
    expect(desactivarZona).toHaveBeenCalledWith(4)
    expect(screen.getByText('Zona desactivada.')).toBeInTheDocument()
  })

  it('sin conexión no deja guardar', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<ZonasPeligro />)
    tocar(-103.35, 20.67)
    tocar(-103.345, 20.67)
    tocar(-103.345, 20.675)
    expect(boton('Guardar zona')).toBeDisabled()
  })
})
