import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  obtenerBloqueos,
  reportarBloqueo,
  renovarBloqueo,
  eliminarBloqueo,
  suscribirseABloqueos,
} from './bloqueos.js'
import { obtenerCliente } from './supabase.js'
import { crearSupabaseFalso } from '../test/supabaseFalso.js'
import { filasBloqueosEjemplo } from '../mocks/bloqueosEjemplo.js'

vi.mock('./supabase.js', () => ({ obtenerCliente: vi.fn() }))

let cliente
beforeEach(() => {
  cliente = crearSupabaseFalso()
  obtenerCliente.mockReturnValue(cliente)
})

describe('obtenerBloqueos', () => {
  it('convierte la fila en Feature con [longitud, latitud] y propiedades planas', async () => {
    cliente.respuestas.vistas.bloqueos_vista = { data: filasBloqueosEjemplo, error: null }

    const { datos } = await obtenerBloqueos()

    expect(cliente.from).toHaveBeenCalledWith('bloqueos_vista')
    expect(datos.features[0].geometry.coordinates).toEqual([-103.35, 20.67])
    expect(datos.features[0].properties).toEqual({
      id: 10,
      tipo: 'total',
      descripcion: 'Árbol caído',
      esAnonimo: true,
      confirmado: false,
      esMio: true,
      expiraEn: Date.parse('2026-10-17T18:00:00+00:00'),
      creadoEn: Date.parse('2026-10-16T18:00:00+00:00'),
      ultimaActividad: Date.parse('2026-10-16T18:00:00+00:00'),
    })
  })

  it('actualizadoEn usa la renovación más reciente', async () => {
    cliente.respuestas.vistas.bloqueos_vista = { data: filasBloqueosEjemplo, error: null }
    const { actualizadoEn } = await obtenerBloqueos()
    expect(actualizadoEn).toBe(Date.parse('2026-10-16T19:30:00+00:00'))
  })

  it('pasa la señal para poder cancelar', async () => {
    const controlador = new AbortController()
    await obtenerBloqueos({ signal: controlador.signal })
    const consulta = cliente.from.mock.results[0].value
    expect(consulta.llamadas).toContainEqual(['abortSignal', controlador.signal])
  })
})

describe('reportarBloqueo', () => {
  it('manda p_longitud y p_latitud en ese orden', async () => {
    cliente.respuestas.rpc.reportar_bloqueo = { data: 7, error: null }

    const id = await reportarBloqueo({ posicion: [-103.35, 20.67], tipo: 'solo_vehiculos', descripcion: 'Inundado' })

    expect(id).toBe(7)
    expect(cliente.rpc).toHaveBeenCalledWith('reportar_bloqueo', {
      p_longitud: -103.35,
      p_latitud: 20.67,
      p_tipo: 'solo_vehiculos',
      p_descripcion: 'Inundado',
    })
  })

  it('el límite de reportes llega en español', async () => {
    cliente.respuestas.rpc.reportar_bloqueo = { data: null, error: { message: 'LIMITE_REPORTES' } }
    await expect(reportarBloqueo({ posicion: [-103.35, 20.67], tipo: 'total' })).rejects.toThrow(
      'Ya enviaste 5 reportes en la última hora',
    )
  })
})

describe('renovar y eliminar', () => {
  it('renovarBloqueo devuelve el nuevo vencimiento en ms', async () => {
    cliente.respuestas.rpc.renovar_bloqueo = { data: '2026-10-17T20:00:00+00:00', error: null }
    await expect(renovarBloqueo(10)).resolves.toBe(Date.parse('2026-10-17T20:00:00+00:00'))
    expect(cliente.rpc).toHaveBeenCalledWith('renovar_bloqueo', { p_id: 10 })
  })

  it('eliminarBloqueo de otro da SIN_PERMISO en español', async () => {
    cliente.respuestas.rpc.eliminar_bloqueo = { data: null, error: { message: 'SIN_PERMISO' } }
    await expect(eliminarBloqueo(11)).rejects.toThrow('No tienes permiso para hacer esto.')
  })
})

describe('suscribirseABloqueos', () => {
  it('avisa cuando cambia la tabla y se puede cancelar', () => {
    const alCambiar = vi.fn()
    const cancelar = suscribirseABloqueos(alCambiar)

    expect(cliente.canales[0].manejadores[0].filtro).toEqual({ event: '*', schema: 'public', table: 'bloqueos' })
    cliente.simularCambio()
    expect(alCambiar).toHaveBeenCalledTimes(1)

    cancelar()
    expect(cliente.removeChannel).toHaveBeenCalled()
  })
})
