import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import AdministrarRefugios from './AdministrarRefugios.jsx'
import { useRefugios } from '../hooks/useRefugios.js'
import { actualizarRefugio } from '../services/refugios.js'
import { crearMapaFalso } from '../test/mapaFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))
vi.mock('../hooks/useRefugios.js', () => ({ useRefugios: vi.fn() }))
vi.mock('../services/refugios.js', () => ({ actualizarRefugio: vi.fn() }))
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

const LISTA = [
  { id: 1, nombre: 'Escuela Juárez', municipio: 'Guadalajara', estado: 'abierto', ocupacion: 10, capacidad: 100, posicion: [-103.35, 20.67] },
  { id: 2, nombre: 'Gimnasio Municipal', municipio: 'Zapopan', estado: 'abierto', ocupacion: 0, capacidad: null, posicion: null },
  { id: 3, nombre: 'Auditorio Ávila', municipio: 'Tlaquepaque', estado: 'cerrado', ocupacion: 0, capacidad: 50, posicion: null },
]

let recargar
function nombresEnLista() {
  return within(screen.getByRole('list', { name: 'Lista de refugios' }))
    .queryAllByRole('button')
    .map((boton) => boton.querySelector('strong').textContent)
}

describe('AdministrarRefugios', () => {
  beforeEach(() => {
    mapaFalso.actual = { ...crearMapaFalso(), jumpTo: vi.fn() }
    recargar = vi.fn()
    useRefugios.mockReturnValue({
      lista: LISTA,
      estado: 'listo',
      error: null,
      actualizadoEn: 1,
      recargar,
    })
    actualizarRefugio.mockReset()
    actualizarRefugio.mockResolvedValue(undefined)
  })

  it('cuenta y filtra los que no tienen ubicación', () => {
    render(<AdministrarRefugios />)

    expect(screen.getByText('2 refugios sin ubicación de 3')).toBeInTheDocument()
    expect(nombresEnLista()).toEqual(['Gimnasio Municipal', 'Auditorio Ávila'])

    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo sin ubicación' }))
    expect(nombresEnLista()).toHaveLength(3)
  })

  it('busca sin importar acentos ni mayúsculas', () => {
    render(<AdministrarRefugios />)
    fireEvent.change(screen.getByLabelText('Buscar por nombre o municipio'), { target: { value: 'avila' } })
    expect(nombresEnLista()).toEqual(['Auditorio Ávila'])
  })

  it('un coordinador ubica un refugio y se manda [longitud, latitud]', async () => {
    render(<AdministrarRefugios />)
    fireEvent.click(screen.getByRole('button', { name: /Gimnasio Municipal/ }))

    act(() => mapaFalso.actual.manejadores.click({ lngLat: { lng: -103.4, lat: 20.72 } }))
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'lleno' } })
    fireEvent.change(screen.getByLabelText(/Personas en el refugio/), { target: { value: '80' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })))

    expect(actualizarRefugio).toHaveBeenCalledWith({ id: 2, posicion: [-103.4, 20.72], estado: 'lleno', ocupacion: 80 })
    expect(await screen.findByText('Refugio guardado')).toBeInTheDocument()
    expect(recargar).toHaveBeenCalledWith({ silencioso: true })
  })

  it('un refugio ya ubicado abre el mapa en su lugar', () => {
    render(<AdministrarRefugios />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo sin ubicación' }))
    fireEvent.click(screen.getByRole('button', { name: /Escuela Juárez/ }))

    expect(mapaFalso.actual.jumpTo).toHaveBeenCalledWith({ center: [-103.35, 20.67], zoom: 15 })
  })

  it('SIN_PERMISO se muestra en español', async () => {
    actualizarRefugio.mockRejectedValue(new Error('No tienes permiso para hacer esto.'))
    render(<AdministrarRefugios />)
    fireEvent.click(screen.getByRole('button', { name: /Gimnasio Municipal/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })))

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para hacer esto.')
  })

  it('no deja guardar una ocupación inválida', () => {
    render(<AdministrarRefugios />)
    fireEvent.click(screen.getByRole('button', { name: /Gimnasio Municipal/ }))
    fireEvent.change(screen.getByLabelText(/Personas en el refugio/), { target: { value: '' } })

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })
})
