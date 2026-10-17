import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import MiBrigada from './MiBrigada.jsx'
import { useMiAsignacion } from '../hooks/useBrigadas.js'
import { avanzarAsignacion } from '../services/brigadas.js'
import { crearMapaFalso } from '../test/mapaFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))
vi.mock('../hooks/useBrigadas.js', () => ({ useMiAsignacion: vi.fn() }))
vi.mock('../services/brigadas.js', () => ({ avanzarAsignacion: vi.fn() }))
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

const BRIGADA = { id: 7, nombre: 'Norte', estado: 'asignada', base: [-103.41, 20.72] }
const INCIDENTE = {
  id: 2,
  tipo: 'derrumbe',
  prioridad: 1,
  descripcion: 'Barda caída sobre la banqueta',
  estado: 'asignado',
  posicion: [-103.4, 20.7],
  asignadoEn: Date.now() - 10 * 60000,
}

let recargar
function simular(asignacion, cambios = {}) {
  useMiAsignacion.mockReturnValue({
    asignacion,
    estado: 'listo',
    error: null,
    consultadoEn: 1,
    recargar,
    ...cambios,
  })
}

describe('MiBrigada', () => {
  beforeEach(() => {
    mapaFalso.actual = { ...crearMapaFalso(), fitBounds: vi.fn(), jumpTo: vi.fn() }
    recargar = vi.fn()
    avanzarAsignacion.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin brigada explica qué hacer', () => {
    simular(null)
    render(<MiBrigada />)
    expect(screen.getByText('Tu cuenta no pertenece a ninguna brigada. Pide al coordinador que te agregue.')).toBeInTheDocument()
  })

  it('sin incidente muestra la base', () => {
    simular({ brigada: { ...BRIGADA, estado: 'disponible' }, incidente: null })
    render(<MiBrigada />)
    expect(screen.getByText('Sin incidente asignado. Mantente disponible en la base.')).toBeInTheDocument()
    expect(mapaFalso.actual.jumpTo).toHaveBeenCalledWith({ center: [-103.41, 20.72], zoom: 14 })
  })

  it('con incidente muestra los datos, el mapa con los dos puntos y el enlace con latitud,longitud', () => {
    simular({ brigada: BRIGADA, incidente: INCIDENTE })
    render(<MiBrigada />)

    expect(screen.getByRole('heading', { name: 'Derrumbe · Prioridad 1 · Crítica' })).toBeInTheDocument()
    expect(screen.getByText('Barda caída sobre la banqueta')).toBeInTheDocument()
    expect(screen.getByText('Asignado hace 10 min')).toBeInTheDocument()
    expect(mapaFalso.actual.fitBounds).toHaveBeenCalledWith(
      [
        [-103.41, 20.7],
        [-103.4, 20.72],
      ],
      expect.any(Object),
    )
    expect(screen.getByRole('link', { name: 'Abrir en mapas' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=20.7,-103.4',
    )
  })

  it.each([
    ['asignada', 'Voy en camino', 'en_camino'],
    ['en_camino', 'Llegué al lugar', 'en_sitio'],
  ])('en estado %s el botón dice "%s" y avanza a %s', async (estado, texto, siguiente) => {
    simular({ brigada: { ...BRIGADA, estado }, incidente: INCIDENTE })
    render(<MiBrigada />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: texto })))

    expect(avanzarAsignacion).toHaveBeenCalledWith(siguiente)
    expect(recargar).toHaveBeenCalledWith({ silencioso: true })
  })

  it('"Terminé" pide confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    simular({ brigada: { ...BRIGADA, estado: 'en_sitio' }, incidente: INCIDENTE })
    render(<MiBrigada />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Terminé' })))

    expect(window.confirm).toHaveBeenCalled()
    expect(avanzarAsignacion).not.toHaveBeenCalled()
  })

  it('TRANSICION_INVALIDA se muestra y se recarga el estado real', async () => {
    avanzarAsignacion.mockRejectedValue(new Error('Ese cambio de estado no es posible ahora.'))
    simular({ brigada: BRIGADA, incidente: INCIDENTE })
    render(<MiBrigada />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Voy en camino' })))

    expect(screen.getByRole('alert')).toHaveTextContent('Ese cambio de estado no es posible ahora.')
    expect(recargar).toHaveBeenCalledWith({ silencioso: true })
  })

  it('sin conexión no avanza', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    simular({ brigada: BRIGADA, incidente: INCIDENTE })
    render(<MiBrigada />)

    const boton = screen.getByRole('button', { name: 'Sin conexión' })
    expect(boton).toBeDisabled()
  })
})
