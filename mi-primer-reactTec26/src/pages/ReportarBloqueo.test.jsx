import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ReportarBloqueo from './ReportarBloqueo.jsx'
import { useSesion } from '../hooks/useSesion.js'
import { reportarBloqueo } from '../services/bloqueos.js'
import { crearMapaFalso } from '../test/mapaFalso.js'
import { marcadores } from '../test/maplibreFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))
vi.mock('../hooks/useSesion.js', () => ({ useSesion: vi.fn() }))
vi.mock('../services/bloqueos.js', () => ({ reportarBloqueo: vi.fn() }))
// El MapaBase falso entrega un mapa falso, como lo haría MapLibre al cargar
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

const clic = (elemento) => fireEvent.click(elemento)

let asegurarSesion
function abrir() {
  return render(
    <MemoryRouter>
      <ReportarBloqueo />
    </MemoryRouter>,
  )
}

// Simula que la persona toca el mapa en [longitud, latitud]
function tocarMapa([lng, lat]) {
  act(() => mapaFalso.actual.manejadores.click({ lngLat: { lng, lat } }))
}

const boton = (nombre) => screen.getByRole('button', { name: nombre })

describe('ReportarBloqueo', () => {
  beforeEach(() => {
    marcadores.length = 0
    mapaFalso.actual = { ...crearMapaFalso(), flyTo: vi.fn() }
    asegurarSesion = vi.fn().mockResolvedValue({ id: 'anonimo-1' })
    useSesion.mockReturnValue({ asegurarSesion, configurado: true })
    reportarBloqueo.mockReset()
    reportarBloqueo.mockResolvedValue(7)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('no deja enviar sin punto o sin tipo', () => {
    abrir()
    expect(boton('Enviar reporte')).toBeDisabled()
    expect(screen.getByText('Falta marcar el punto en el mapa.')).toBeInTheDocument()

    tocarMapa([-103.35, 20.67])
    expect(boton('Enviar reporte')).toBeDisabled()
    expect(screen.getByText('Falta elegir el tipo de bloqueo.')).toBeInTheDocument()

    clic(screen.getByRole('radio', { name: /Parcial/ }))
    expect(boton('Enviar reporte')).toBeEnabled()
  })

  it('ningún tipo viene elegido por defecto', () => {
    abrir()
    expect(screen.getByRole('radio', { name: /Parcial/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Total/ })).not.toBeChecked()
  })

  it('tocar el mapa pone un marcador en [longitud, latitud]', () => {
    abrir()
    tocarMapa([-103.35, 20.67])
    expect(marcadores.at(-1).lngLat).toEqual([-103.35, 20.67])
    expect(marcadores.at(-1).opciones.draggable).toBe(true)
  })

  it('crea sesión anónima y envía [longitud, latitud] del punto tocado', async () => {
    abrir()
    tocarMapa([-103.35, 20.67])
    clic(screen.getByRole('radio', { name: /Total/ }))
    await act(async () => clic(boton('Enviar reporte')))

    expect(asegurarSesion).toHaveBeenCalled()
    expect(asegurarSesion.mock.invocationCallOrder[0]).toBeLessThan(reportarBloqueo.mock.invocationCallOrder[0])
    expect(reportarBloqueo).toHaveBeenCalledWith({ posicion: [-103.35, 20.67], tipo: 'total', descripcion: null })
    expect(await screen.findByText('Reporte enviado. Vence en 24 h.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver en el mapa' })).toHaveAttribute('href', '/')
  })

  it('muestra el mensaje de límite de reportes y conserva el formulario', async () => {
    reportarBloqueo.mockRejectedValue(
      new Error('Ya enviaste 5 reportes en la última hora. Espera un poco antes de enviar otro.'),
    )
    abrir()
    tocarMapa([-103.35, 20.67])
    clic(screen.getByRole('radio', { name: /Total/ }))
    await act(async () => clic(boton('Enviar reporte')))

    expect(await screen.findByText(/Ya enviaste 5 reportes/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Total/ })).toBeChecked()
    expect(boton('Enviar reporte')).toBeEnabled()
  })

  it('sin conexión no envía y conserva el formulario', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    abrir()
    tocarMapa([-103.35, 20.67])
    clic(screen.getByRole('radio', { name: /Total/ }))

    const enviar = boton('Sin conexión: no se puede enviar')
    expect(enviar).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Total/ })).toBeChecked()

    // Al volver la conexión se puede enviar lo mismo
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    act(() => window.dispatchEvent(new Event('online')))
    expect(boton('Enviar reporte')).toBeEnabled()
  })

  it('un punto fuera de México no se puede enviar', () => {
    abrir()
    tocarMapa([-3.7, 40.4])
    clic(screen.getByRole('radio', { name: /Total/ }))

    expect(screen.getByText('El punto está fuera de México. Revisa la ubicación.')).toBeInTheDocument()
    expect(boton('Enviar reporte')).toBeDisabled()
  })

  it('Usar mi ubicación mueve el punto y centra el mapa', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      onLine: true,
      geolocation: {
        getCurrentPosition: (exito) => exito({ coords: { latitude: 20.67, longitude: -103.35 } }),
      },
    })
    abrir()
    await act(async () => clic(boton('Usar mi ubicación')))

    expect(marcadores.at(-1).lngLat).toEqual([-103.35, 20.67])
    expect(mapaFalso.actual.flyTo).toHaveBeenCalledWith({ center: [-103.35, 20.67], zoom: 16 })
  })

  it('si niegan el permiso de ubicación lo explica', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      onLine: true,
      geolocation: { getCurrentPosition: (_exito, falla) => falla({ code: 1 }) },
    })
    abrir()
    await act(async () => clic(boton('Usar mi ubicación')))

    await waitFor(() => expect(screen.getByText('No diste permiso para usar tu ubicación.')).toBeInTheDocument())
  })

  it('sin Supabase configurado lo dice y no deja enviar', () => {
    useSesion.mockReturnValue({ asegurarSesion, configurado: false })
    abrir()
    tocarMapa([-103.35, 20.67])
    clic(screen.getByRole('radio', { name: /Total/ }))

    expect(screen.getByText('No se pueden enviar reportes: falta configurar Supabase.')).toBeInTheDocument()
    expect(boton('Enviar reporte')).toBeDisabled()
  })
})
