import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import PanelBrigadas from './PanelBrigadas.jsx'
import { useIncidentes, useBrigadas } from '../hooks/useBrigadas.js'
import { crearIncidente, cancelarIncidente, actualizarIncidente } from '../services/incidentes.js'
import { asignarBrigada, liberarBrigada } from '../services/brigadas.js'
import { crearMapaFalso } from '../test/mapaFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))
vi.mock('../hooks/useBrigadas.js', () => ({ useIncidentes: vi.fn(), useBrigadas: vi.fn() }))
vi.mock('../services/incidentes.js', () => ({
  crearIncidente: vi.fn(),
  cancelarIncidente: vi.fn(),
  actualizarIncidente: vi.fn(),
}))
vi.mock('../services/brigadas.js', () => ({ asignarBrigada: vi.fn(), liberarBrigada: vi.fn() }))
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

function incidente(id, propiedades, coordenadas = [-103.36, 20.68]) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coordenadas },
    properties: { id, tipo: 'rescate', prioridad: 1, estado: 'pendiente', creadoEn: 0, ...propiedades },
  }
}
function brigada(id, nombre, estado, coordenadas) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: coordenadas }, properties: { id, nombre, estado } }
}

const INCIDENTES = {
  type: 'FeatureCollection',
  features: [
    incidente(1, { prioridad: 1 }),
    incidente(2, {
      tipo: 'derrumbe',
      prioridad: 3,
      estado: 'asignado',
      brigadaId: 7,
      brigadaNombre: 'Norte',
      brigadaEstado: 'asignada',
    }),
  ],
}
const BRIGADAS = {
  type: 'FeatureCollection',
  features: [
    brigada(7, 'Norte', 'asignada', [-103.41, 20.72]),
    brigada(8, 'Sur', 'disponible', [-103.35, 20.6]),
    brigada(9, 'Oriente', 'disponible', [-103.2, 20.68]),
  ],
}

let recargarIncidentes
let recargarBrigadas
function estado(datos, nombre, recargar) {
  return { [nombre]: datos, estado: 'listo', error: null, actualizadoEn: 1, consultadoEn: 1, recargar }
}

function abrir(ruta = '/brigadas') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <PanelBrigadas />
    </MemoryRouter>,
  )
}
const boton = (nombre) => screen.getByRole('button', { name: nombre })

describe('PanelBrigadas', () => {
  beforeEach(() => {
    mapaFalso.actual = crearMapaFalso()
    recargarIncidentes = vi.fn()
    recargarBrigadas = vi.fn()
    useIncidentes.mockReturnValue(estado(INCIDENTES, 'incidentes', recargarIncidentes))
    useBrigadas.mockReturnValue(estado(BRIGADAS, 'brigadas', recargarBrigadas))
    for (const fn of [crearIncidente, cancelarIncidente, actualizarIncidente, asignarBrigada, liberarBrigada]) {
      fn.mockReset().mockResolvedValue(undefined)
    }
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resume por atender, en curso y brigadas disponibles', () => {
    abrir()
    expect(screen.getByText('1 por atender · 1 en curso · 2 brigadas disponibles')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Por atender (1)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'En curso (1)' })).toBeInTheDocument()
  })

  it('sugiere la brigada disponible más cercana y la asigna con un toque', async () => {
    abrir()
    // Sur está a ~9 km; Oriente a ~17 km
    expect(screen.getByText(/^Sugerida: Sur · \d/)).toBeInTheDocument()

    await act(async () => fireEvent.click(boton('Asignar Sur')))

    expect(asignarBrigada).toHaveBeenCalledWith({ incidenteId: 1, brigadaId: 8 })
    expect(recargarIncidentes).toHaveBeenCalledWith({ silencioso: true })
    expect(recargarBrigadas).toHaveBeenCalledWith({ silencioso: true })
  })

  it('"Cambiar" deja elegir otra brigada disponible', async () => {
    abrir()
    fireEvent.click(boton('Cambiar'))
    const opciones = within(screen.getByRole('list', { name: 'Brigadas disponibles' })).getAllByRole('button')
    expect(opciones.map((b) => b.textContent.split(' · ')[0])).toEqual(['Asignar Sur', 'Asignar Oriente'])

    await act(async () => fireEvent.click(opciones[1]))
    expect(asignarBrigada).toHaveBeenCalledWith({ incidenteId: 1, brigadaId: 9 })
  })

  it('si otro coordinador ganó la brigada, lo dice y recarga', async () => {
    asignarBrigada.mockRejectedValue(new Error('La brigada ya tiene un incidente o no está disponible.'))
    abrir()
    await act(async () => fireEvent.click(boton('Asignar Sur')))

    expect(screen.getByRole('alert')).toHaveTextContent('La brigada ya tiene un incidente')
    expect(recargarIncidentes).toHaveBeenCalled()
  })

  it('liberar una brigada en curso pide confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    abrir()
    await act(async () => fireEvent.click(boton('Liberar brigada')))

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('¿Liberar a Norte?'))
    expect(liberarBrigada).toHaveBeenCalledWith(7)
  })

  it('cambiar la prioridad la guarda', async () => {
    abrir()
    const selectores = screen.getAllByLabelText('Prioridad')
    await act(async () => fireEvent.change(selectores[0], { target: { value: '2' } }))
    expect(actualizarIncidente).toHaveBeenCalledWith({ id: 1, prioridad: 2, descripcion: undefined })
  })

  it('sin conexión no deja asignar', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    abrir()
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument()
    expect(boton('Asignar Sur')).toBeDisabled()
  })

  describe('nuevo incidente', () => {
    it('se crea tocando el mapa, con [longitud, latitud] y prioridad', async () => {
      abrir()
      fireEvent.click(boton('Nuevo incidente'))
      act(() => mapaFalso.actual.manejadores.click({ lngLat: { lng: -103.3, lat: 20.65 } }))
      fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'incendio' } })
      fireEvent.click(screen.getByRole('radio', { name: '2 · Alta' }))
      await act(async () => fireEvent.click(boton('Crear incidente')))

      expect(crearIncidente).toHaveBeenCalledWith({
        posicion: [-103.3, 20.65],
        tipo: 'incendio',
        prioridad: 2,
        descripcion: null,
        bloqueoId: null,
      })
      expect(screen.getByText('Incidente creado.')).toBeInTheDocument()
    })

    it('avisa si ya hay uno igual muy cerca y no lo crea si se cancela', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      abrir()
      fireEvent.click(boton('Nuevo incidente'))
      // A ~10 m del incidente 1 (rescate)
      act(() => mapaFalso.actual.manejadores.click({ lngLat: { lng: -103.3601, lat: 20.68 } }))
      fireEvent.click(screen.getByRole('radio', { name: '1 · Crítica' }))

      expect(screen.getByText(/Posible duplicado: ya hay un incidente de rescate abierto a \d+ m/)).toBeInTheDocument()
      await act(async () => fireEvent.click(boton('Crear incidente')))

      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('¿Crear otro de todos modos?'))
      expect(crearIncidente).not.toHaveBeenCalled()
    })

    it('desde un bloqueo llega con el punto, el tipo y el id del bloqueo', async () => {
      abrir('/brigadas?bloqueo=10&lng=-103.35&lat=20.67')

      expect(screen.getByText('Desde el bloqueo reportado #10.')).toBeInTheDocument()
      expect(screen.getByLabelText('Tipo')).toHaveValue('bloqueo')
      fireEvent.click(screen.getByRole('radio', { name: '3 · Media' }))
      await act(async () => fireEvent.click(boton('Crear incidente')))

      expect(crearIncidente).toHaveBeenCalledWith(
        expect.objectContaining({ posicion: [-103.35, 20.67], tipo: 'bloqueo', bloqueoId: 10 }),
      )
    })

    it('un error al crear se muestra y conserva el formulario', async () => {
      crearIncidente.mockRejectedValue(new Error('No tienes permiso para hacer esto.'))
      abrir()
      fireEvent.click(boton('Nuevo incidente'))
      act(() => mapaFalso.actual.manejadores.click({ lngLat: { lng: -103.3, lat: 20.65 } }))
      fireEvent.click(screen.getByRole('radio', { name: '1 · Crítica' }))
      await act(async () => fireEvent.click(boton('Crear incidente')))

      expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso')
      expect(screen.getByRole('radio', { name: '1 · Crítica' })).toBeChecked()
    })
  })
})
