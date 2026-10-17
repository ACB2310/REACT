import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import GestionBrigadas from './GestionBrigadas.jsx'
import { useBrigadas } from '../hooks/useBrigadas.js'
import { asignarMiembro, cambiarServicioBrigada, guardarBrigada, obtenerBrigadistas } from '../services/brigadas.js'
import { crearMapaFalso } from '../test/mapaFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))
vi.mock('../hooks/useBrigadas.js', () => ({ useBrigadas: vi.fn() }))
vi.mock('../services/brigadas.js', () => ({
  asignarMiembro: vi.fn(),
  cambiarServicioBrigada: vi.fn(),
  guardarBrigada: vi.fn(),
  obtenerBrigadistas: vi.fn(),
}))
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

function brigada(id, nombre, estado, incidenteId = null) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-103.35, 20.67] },
    properties: { id, nombre, estado, incidenteId, vehiculo: null, miembros: 1 },
  }
}
const BRIGADAS = {
  type: 'FeatureCollection',
  features: [brigada(7, 'Norte', 'asignada', 2), brigada(8, 'Sur', 'disponible')],
}

let recargar
function abrir() {
  return render(
    <MemoryRouter>
      <GestionBrigadas />
    </MemoryRouter>,
  )
}
const boton = (nombre) => screen.getByRole('button', { name: nombre })

describe('GestionBrigadas', () => {
  beforeEach(() => {
    mapaFalso.actual = { ...crearMapaFalso(), jumpTo: vi.fn() }
    recargar = vi.fn()
    useBrigadas.mockReturnValue({ brigadas: BRIGADAS, estado: 'listo', error: null, actualizadoEn: 1, recargar })
    obtenerBrigadistas.mockReset().mockResolvedValue([{ id: 'u1', correo: 'b1@ejemplo.mx', nombre: null, brigadaId: 8 }])
    for (const fn of [asignarMiembro, cambiarServicioBrigada, guardarBrigada]) fn.mockReset().mockResolvedValue(undefined)
  })

  it('crear una brigada manda la base en [longitud, latitud]', async () => {
    abrir()
    fireEvent.click(boton('Nueva brigada'))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: ' Oriente ' } })
    fireEvent.change(screen.getByLabelText('Vehículo (opcional)'), { target: { value: 'Ambulancia' } })
    act(() => mapaFalso.actual.manejadores.click({ lngLat: { lng: -103.2, lat: 20.68 } }))
    await act(async () => fireEvent.click(boton('Guardar brigada')))

    expect(guardarBrigada).toHaveBeenCalledWith({ id: null, nombre: 'Oriente', vehiculo: 'Ambulancia', base: [-103.2, 20.68] })
    expect(screen.getByText('Brigada creada.')).toBeInTheDocument()
  })

  it('NOMBRE_REPETIDO se muestra y conserva el formulario', async () => {
    guardarBrigada.mockRejectedValue(new Error('Ya existe una brigada con ese nombre.'))
    abrir()
    fireEvent.click(boton('Nueva brigada'))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sur' } })
    act(() => mapaFalso.actual.manejadores.click({ lngLat: { lng: -103.2, lat: 20.68 } }))
    await act(async () => fireEvent.click(boton('Guardar brigada')))

    expect(screen.getByRole('alert')).toHaveTextContent('Ya existe una brigada con ese nombre.')
    expect(screen.getByLabelText('Nombre')).toHaveValue('Sur')
  })

  it('editar empieza con los datos y la base actuales', async () => {
    abrir()
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[1])
    expect(screen.getByLabelText('Nombre')).toHaveValue('Sur')
    expect(mapaFalso.actual.jumpTo).toHaveBeenCalledWith({ center: [-103.35, 20.67], zoom: 14 })

    await act(async () => fireEvent.click(boton('Guardar brigada')))
    expect(guardarBrigada).toHaveBeenCalledWith(expect.objectContaining({ id: 8, base: [-103.35, 20.67] }))
  })

  it('no se puede poner fuera de servicio una brigada ocupada', () => {
    abrir()
    const botones = screen.getAllByRole('button', { name: 'Poner fuera de servicio' })
    expect(botones[0]).toBeDisabled()
    expect(botones[1]).toBeEnabled()
    expect(screen.getByText('Está atendiendo un incidente.')).toBeInTheDocument()
  })

  it('poner fuera de servicio llama a la RPC y recarga', async () => {
    abrir()
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Poner fuera de servicio' })[1]))
    expect(cambiarServicioBrigada).toHaveBeenCalledWith({ id: 8, enServicio: false })
    expect(recargar).toHaveBeenCalledWith({ silencioso: true })
  })

  it('cambia a un brigadista de brigada', async () => {
    abrir()
    const selector = await screen.findByLabelText('b1@ejemplo.mx')
    expect(selector).toHaveValue('8')

    await act(async () => fireEvent.change(selector, { target: { value: '7' } }))
    expect(asignarMiembro).toHaveBeenCalledWith({ usuarioId: 'u1', brigadaId: 7 })
    await waitFor(() => expect(obtenerBrigadistas).toHaveBeenCalledTimes(2))
  })

  it('sin cuentas de brigadista explica cómo dar el rol', async () => {
    obtenerBrigadistas.mockResolvedValue([])
    abrir()
    expect(await screen.findByText(/No hay cuentas con rol de brigadista/)).toBeInTheDocument()
  })
})
