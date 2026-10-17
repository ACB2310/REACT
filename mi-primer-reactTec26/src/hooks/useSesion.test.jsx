import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSesion } from './useSesion.js'
import ProveedorSesion from '../components/ProveedorSesion.jsx'
import { crearSupabaseFalso } from '../test/supabaseFalso.js'
import { traducirErrorSesion } from '../services/sesion.js'

// El cliente falso se cambia en cada prueba
const { falso } = vi.hoisted(() => ({ falso: { cliente: null } }))
vi.mock('../services/supabase.js', () => ({
  supabaseConfigurado: true,
  obtenerCliente: () => falso.cliente,
}))

function usarSesion() {
  return renderHook(() => useSesion(), { wrapper: ProveedorSesion })
}

const CUENTA = { id: 'cuenta-1', is_anonymous: false, email: 'brigada@ejemplo.mx' }

beforeEach(() => {
  falso.cliente = crearSupabaseFalso()
})

describe('useSesion', () => {
  it('sin sesión guardada queda como ciudadano y no crea sesión', async () => {
    const { result } = usarSesion()

    await waitFor(() => expect(result.current.cargando).toBe(false))
    expect(result.current.usuario).toBeNull()
    expect(result.current.rol).toBe('ciudadano')
    expect(falso.cliente.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('el rol llega de rol_actual', async () => {
    falso.cliente = crearSupabaseFalso({ sesionInicial: { user: CUENTA } })
    falso.cliente.respuestas.rpc.rol_actual = { data: 'brigadista', error: null }

    const { result } = usarSesion()

    await waitFor(() => expect(result.current.rol).toBe('brigadista'))
    expect(result.current.esAnonimo).toBe(false)
  })

  it('asegurarSesion crea sesión anónima solo si no hay', async () => {
    const { result } = usarSesion()
    await waitFor(() => expect(result.current.cargando).toBe(false))

    // Dos envíos al mismo tiempo crean una sola sesión
    await act(() => Promise.all([result.current.asegurarSesion(), result.current.asegurarSesion()]))
    await act(() => result.current.asegurarSesion())

    expect(falso.cliente.auth.signInAnonymously).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.esAnonimo).toBe(true))
    expect(result.current.rol).toBe('ciudadano')
  })

  it('con cuenta, asegurarSesion no crea otra sesión', async () => {
    falso.cliente = crearSupabaseFalso({ sesionInicial: { user: CUENTA } })
    const { result } = usarSesion()
    await waitFor(() => expect(result.current.usuario).toEqual(CUENTA))

    await act(() => result.current.asegurarSesion())
    expect(falso.cliente.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('salir vuelve a ciudadano', async () => {
    falso.cliente = crearSupabaseFalso({ sesionInicial: { user: CUENTA } })
    falso.cliente.respuestas.rpc.rol_actual = { data: 'coordinador', error: null }
    const { result } = usarSesion()
    await waitFor(() => expect(result.current.rol).toBe('coordinador'))

    await act(() => result.current.salir())

    await waitFor(() => expect(result.current.rol).toBe('ciudadano'))
    expect(result.current.usuario).toBeNull()
  })

  it('si no se puede leer el rol, usa ciudadano', async () => {
    falso.cliente = crearSupabaseFalso({ sesionInicial: { user: CUENTA } })
    falso.cliente.respuestas.rpc.rol_actual = { data: null, error: { message: 'TypeError: Failed to fetch' } }

    const { result } = usarSesion()

    await waitFor(() => expect(result.current.cargando).toBe(false))
    expect(result.current.rol).toBe('ciudadano')
  })

  it('al crear cuenta, el correo de confirmación regresa a la dirección actual de la app', async () => {
    const { result } = usarSesion()
    await waitFor(() => expect(result.current.cargando).toBe(false))

    await act(() => result.current.crearCuenta('nuevo@ejemplo.mx', 'secreta1'))

    expect(falso.cliente.auth.signUp).toHaveBeenCalledWith({
      email: 'nuevo@ejemplo.mx',
      password: 'secreta1',
      options: { emailRedirectTo: window.location.origin },
    })
  })

  it('traduce credenciales incorrectas', async () => {
    falso.cliente.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    })
    const { result } = usarSesion()
    await waitFor(() => expect(result.current.cargando).toBe(false))

    await expect(result.current.entrar('a@b.mx', 'mala')).rejects.toThrow('Correo o contraseña incorrectos')
  })
})

describe('traducirErrorSesion', () => {
  it('avisa si los reportes sin cuenta no están activados', () => {
    expect(traducirErrorSesion({ message: 'Anonymous sign-ins are disabled' }).message).toBe(
      'Los reportes sin cuenta no están activados en Supabase',
    )
  })
})
