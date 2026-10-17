import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App.jsx'
import { useSesion } from './hooks/useSesion.js'

// Las pantallas se reemplazan por textos: aquí solo se prueba la navegación
vi.mock('./pages/Mapa.jsx', () => ({ default: () => <p>Pantalla mapa</p> }))
vi.mock('./pages/ReportarBloqueo.jsx', () => ({ default: () => <p>Pantalla reportar</p> }))
vi.mock('./pages/IniciarSesion.jsx', () => ({ default: () => <p>Pantalla entrar</p> }))
vi.mock('./pages/AdministrarRefugios.jsx', () => ({ default: () => <p>Pantalla refugios</p> }))
vi.mock('./pages/PanelBrigadas.jsx', () => ({ default: () => <p>Pantalla brigadas</p> }))
vi.mock('./pages/GestionBrigadas.jsx', () => ({ default: () => <p>Pantalla equipos</p> }))
vi.mock('./pages/MiBrigada.jsx', () => ({ default: () => <p>Pantalla mi brigada</p> }))
vi.mock('./hooks/useSesion.js', () => ({ useSesion: vi.fn() }))

function sesion(cambios) {
  return { usuario: null, esAnonimo: false, rol: 'ciudadano', cargando: false, ...cambios }
}

function abrir(ruta) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  beforeEach(() => {
    useSesion.mockReturnValue(sesion())
  })

  it('abre el mapa en /', () => {
    abrir('/')
    expect(screen.getByText('Pantalla mapa')).toBeInTheDocument()
  })

  it('una ruta desconocida lleva al mapa', () => {
    abrir('/no-existe')
    expect(screen.getByText('Pantalla mapa')).toBeInTheDocument()
  })

  it('muestra Refugios solo al coordinador', () => {
    const { unmount } = abrir('/')
    expect(screen.queryByRole('link', { name: 'Refugios' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Entrar' })).toBeInTheDocument()
    unmount()

    useSesion.mockReturnValue(sesion({ rol: 'coordinador', usuario: { id: 'c1', email: 'c@x.mx' } }))
    abrir('/')
    expect(screen.getByRole('link', { name: 'Refugios' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mi cuenta' })).toBeInTheDocument()
  })

  it('un ciudadano que abre /refugios ve que no tiene acceso', () => {
    abrir('/refugios')
    expect(screen.queryByText('Pantalla refugios')).toBeNull()
    expect(screen.getByText('Esta pantalla es solo para coordinadores.')).toBeInTheDocument()
  })

  it('el coordinador sí ve la pantalla de refugios', () => {
    useSesion.mockReturnValue(sesion({ rol: 'coordinador', usuario: { id: 'c1' } }))
    abrir('/refugios')
    expect(screen.getByText('Pantalla refugios')).toBeInTheDocument()
  })

  it('un usuario anónimo sigue viendo "Entrar"', () => {
    useSesion.mockReturnValue(sesion({ usuario: { id: 'a1', is_anonymous: true }, esAnonimo: true }))
    abrir('/')
    expect(screen.getByRole('link', { name: 'Entrar' })).toBeInTheDocument()
  })
})

describe('App: brigadas (etapa 6)', () => {
  beforeEach(() => {
    useSesion.mockReturnValue(sesion())
  })

  it('el coordinador ve Brigadas y abre el panel y la gestión de equipos', () => {
    useSesion.mockReturnValue(sesion({ rol: 'coordinador', usuario: { id: 'c1' } }))
    const { unmount } = abrir('/brigadas')
    expect(screen.getByRole('link', { name: 'Brigadas' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Mi brigada' })).toBeNull()
    expect(screen.getByText('Pantalla brigadas')).toBeInTheDocument()
    unmount()

    abrir('/brigadas/equipos')
    expect(screen.getByText('Pantalla equipos')).toBeInTheDocument()
    // "Brigadas" sigue marcada dentro de /brigadas/equipos
    expect(screen.getByRole('link', { name: 'Brigadas' })).toHaveClass('active')
  })

  it('el brigadista ve Mi brigada y no ve Brigadas ni Refugios', () => {
    useSesion.mockReturnValue(sesion({ rol: 'brigadista', usuario: { id: 'b1' } }))
    abrir('/mi-brigada')
    expect(screen.getByText('Pantalla mi brigada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mi brigada' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Brigadas' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Refugios' })).toBeNull()
  })

  it('un ciudadano no entra a las pantallas de brigadas', () => {
    const { unmount } = abrir('/brigadas')
    expect(screen.getByText('Esta pantalla es solo para coordinadores.')).toBeInTheDocument()
    unmount()
    abrir('/mi-brigada')
    expect(screen.getByText('Esta pantalla es solo para brigadistas.')).toBeInTheDocument()
  })

  it('un brigadista no entra al panel del coordinador', () => {
    useSesion.mockReturnValue(sesion({ rol: 'brigadista', usuario: { id: 'b1' } }))
    abrir('/brigadas')
    expect(screen.queryByText('Pantalla brigadas')).toBeNull()
  })
})
