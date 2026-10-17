import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import IniciarSesion from './IniciarSesion.jsx'
import { useSesion } from '../hooks/useSesion.js'

vi.mock('../hooks/useSesion.js', () => ({ useSesion: vi.fn() }))

function sesion(cambios) {
  return {
    usuario: null,
    esAnonimo: false,
    rol: 'ciudadano',
    cargando: false,
    configurado: true,
    entrar: vi.fn().mockResolvedValue({}),
    crearCuenta: vi.fn().mockResolvedValue({ necesitaConfirmar: false }),
    salir: vi.fn().mockResolvedValue({}),
    ...cambios,
  }
}

function escribir(etiqueta, valor) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
}

describe('IniciarSesion', () => {
  let actual
  beforeEach(() => {
    actual = sesion()
    useSesion.mockImplementation(() => actual)
  })

  it('dice que no hace falta cuenta para reportar', () => {
    render(<IniciarSesion />)
    expect(screen.getByText('No necesitas cuenta para reportar bloqueos.')).toBeInTheDocument()
  })

  it('entra con el correo sin espacios', async () => {
    render(<IniciarSesion />)
    escribir('Correo', ' brigada@ejemplo.mx ')
    escribir('Contraseña', 'secreta1')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' })))

    expect(actual.entrar).toHaveBeenCalledWith('brigada@ejemplo.mx', 'secreta1')
  })

  it('entrar con credenciales incorrectas muestra el error en español', async () => {
    actual = sesion({ entrar: vi.fn().mockRejectedValue(new Error('Correo o contraseña incorrectos')) })
    render(<IniciarSesion />)
    escribir('Correo', 'a@b.mx')
    escribir('Contraseña', 'malamala')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' })))

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos')
  })

  it('al crear cuenta avisa si hay que confirmar el correo', async () => {
    actual = sesion({ crearCuenta: vi.fn().mockResolvedValue({ necesitaConfirmar: true }) })
    render(<IniciarSesion />)
    escribir('Correo', 'nuevo@ejemplo.mx')
    escribir('Contraseña', 'secreta1')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' })))

    expect(await screen.findByText('Te enviamos un correo para confirmar tu cuenta.')).toBeInTheDocument()
  })

  it('muestra el rol del usuario y deja salir', async () => {
    actual = sesion({ usuario: { id: 'u1', email: 'coord@ejemplo.mx' }, rol: 'coordinador' })
    // Mi cuenta tiene enlaces a las pantallas del rol, por eso necesita el router
    render(<IniciarSesion />, { wrapper: MemoryRouter })

    expect(screen.getByText('coord@ejemplo.mx')).toBeInTheDocument()
    expect(screen.getByText('Coordinador')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salir' })))
    expect(actual.salir).toHaveBeenCalled()
  })

  it('con sesión anónima lo dice y ofrece entrar', () => {
    actual = sesion({ usuario: { id: 'a1', is_anonymous: true }, esAnonimo: true })
    render(<IniciarSesion />)
    expect(screen.getByText('Estás usando la app sin cuenta.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('sin Supabase configurado lo dice', () => {
    actual = sesion({ configurado: false })
    render(<IniciarSesion />)
    expect(screen.getByText('No se puede entrar: falta configurar Supabase.')).toBeInTheDocument()
  })

  it('explica para quién es la cuenta', () => {
    render(<IniciarSesion />)
    expect(screen.getByText(/La cuenta es para brigadistas y coordinadores/)).toBeInTheDocument()
    expect(screen.getByText('Mínimo 6 caracteres.')).toBeInTheDocument()
  })

  it('crear cuenta con contraseña corta dice qué falta y no la crea', async () => {
    render(<IniciarSesion />)
    escribir('Correo', 'nuevo@ejemplo.mx')
    escribir('Contraseña', '123')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' })))

    expect(screen.getByRole('alert')).toHaveTextContent('La contraseña necesita al menos 6 caracteres.')
    expect(actual.crearCuenta).not.toHaveBeenCalled()
  })

  it('crear cuenta sin correo lo pide', async () => {
    render(<IniciarSesion />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' })))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe tu correo para crear la cuenta.')
  })

  it('Mostrar deja ver la contraseña y Ocultar la vuelve a esconder', () => {
    render(<IniciarSesion />)
    const campo = screen.getByLabelText('Contraseña')
    expect(campo).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
    expect(campo).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    expect(campo).toHaveAttribute('type', 'password')
  })

  it('Mi cuenta lleva a las pantallas de cada rol', () => {
    actual = sesion({ usuario: { id: 'u1', email: 'coord@ejemplo.mx' }, rol: 'coordinador' })
    const { unmount } = render(<IniciarSesion />, { wrapper: MemoryRouter })
    expect(screen.getByRole('link', { name: 'Panel de brigadas' })).toHaveAttribute('href', '/brigadas')
    expect(screen.getByRole('link', { name: 'Zonas de peligro' })).toHaveAttribute('href', '/zonas')
    unmount()

    actual = sesion({ usuario: { id: 'u2', email: 'b@ejemplo.mx' }, rol: 'brigadista' })
    render(<IniciarSesion />, { wrapper: MemoryRouter })
    expect(screen.getByRole('link', { name: 'Mi brigada' })).toHaveAttribute('href', '/mi-brigada')
    expect(screen.queryByRole('link', { name: 'Panel de brigadas' })).toBeNull()
  })
})
