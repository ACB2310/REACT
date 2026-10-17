import { describe, it, expect, vi, beforeEach } from 'vitest'
import { obtenerRefugios, actualizarRefugio } from './refugios.js'
import { obtenerCliente } from './supabase.js'
import { crearSupabaseFalso } from '../test/supabaseFalso.js'
import { filasRefugiosEjemplo } from '../mocks/refugiosEjemplo.js'

vi.mock('./supabase.js', () => ({ obtenerCliente: vi.fn() }))

let cliente
beforeEach(() => {
  cliente = crearSupabaseFalso()
  obtenerCliente.mockReturnValue(cliente)
})

describe('obtenerRefugios', () => {
  it('convierte la fila en Feature con [longitud, latitud]', async () => {
    cliente.respuestas.vistas.refugios_vista = { data: filasRefugiosEjemplo, error: null }

    const { datos } = await obtenerRefugios()

    expect(cliente.from).toHaveBeenCalledWith('refugios_vista')
    expect(datos.features[0].geometry.coordinates).toEqual([-103.35, 20.67])
    expect(datos.features[0].properties).toMatchObject({ nombre: 'Refugio de ejemplo Centro', capacidad: 120 })
  })

  it('los refugios sin ubicación no van al mapa, pero sí a la lista', async () => {
    cliente.respuestas.vistas.refugios_vista = { data: filasRefugiosEjemplo, error: null }

    const { datos, refugios } = await obtenerRefugios()

    expect(datos.features).toHaveLength(1)
    expect(refugios).toHaveLength(2)
    expect(refugios[1].posicion).toBeNull()
  })

  it('actualizadoEn es la actualización más reciente', async () => {
    cliente.respuestas.vistas.refugios_vista = { data: filasRefugiosEjemplo, error: null }
    const { actualizadoEn } = await obtenerRefugios()
    expect(actualizadoEn).toBe(Date.parse('2026-10-16T18:00:00+00:00'))
  })

  it('sin refugios actualizadoEn es null', async () => {
    const { datos, actualizadoEn } = await obtenerRefugios()
    expect(datos.features).toEqual([])
    expect(actualizadoEn).toBeNull()
  })

  it('traduce los errores de Supabase', async () => {
    cliente.respuestas.vistas.refugios_vista = { data: null, error: { message: 'TypeError: Failed to fetch' } }
    await expect(obtenerRefugios()).rejects.toThrow('No se pudo conectar con Supabase')
  })

  it('sin Supabase configurado lanza el mensaje en español', async () => {
    obtenerCliente.mockImplementation(() => {
      throw new Error('Supabase no está configurado')
    })
    await expect(obtenerRefugios()).rejects.toThrow('Supabase no está configurado')
  })
})

describe('actualizarRefugio', () => {
  it('manda p_longitud y p_latitud en ese orden', async () => {
    await actualizarRefugio({ id: 2, posicion: [-103.4, 20.7], estado: 'lleno', ocupacion: 50 })
    expect(cliente.rpc).toHaveBeenCalledWith('actualizar_refugio', {
      p_id: 2,
      p_longitud: -103.4,
      p_latitud: 20.7,
      p_estado: 'lleno',
      p_ocupacion: 50,
    })
  })

  it('SIN_PERMISO llega en español', async () => {
    cliente.respuestas.rpc.actualizar_refugio = { data: null, error: { message: 'SIN_PERMISO' } }
    await expect(actualizarRefugio({ id: 2 })).rejects.toThrow('No tienes permiso para hacer esto.')
  })
})
