import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  obtenerIncidentes,
  crearIncidente,
  actualizarIncidente,
  cancelarIncidente,
  suscribirseABrigadas,
} from './incidentes.js'
import {
  obtenerBrigadas,
  obtenerMiAsignacion,
  obtenerBrigadistas,
  asignarBrigada,
  liberarBrigada,
  avanzarAsignacion,
  guardarBrigada,
  cambiarServicioBrigada,
  asignarMiembro,
} from './brigadas.js'
import { obtenerCliente } from './supabase.js'
import { crearSupabaseFalso } from '../test/supabaseFalso.js'
import { filasIncidentesEjemplo, filasBrigadasEjemplo, filaMiAsignacionEjemplo } from '../mocks/brigadasEjemplo.js'

vi.mock('./supabase.js', () => ({ obtenerCliente: vi.fn() }))

let cliente
beforeEach(() => {
  cliente = crearSupabaseFalso()
  obtenerCliente.mockReturnValue(cliente)
})

describe('obtenerIncidentes', () => {
  it('convierte cada fila en Feature con [longitud, latitud] y ordena por prioridad y fecha', async () => {
    cliente.respuestas.vistas.incidentes_vista = { data: filasIncidentesEjemplo, error: null }

    const { datos, actualizadoEn } = await obtenerIncidentes()

    expect(cliente.from).toHaveBeenCalledWith('incidentes_vista')
    const consulta = cliente.from.mock.results[0].value
    expect(consulta.llamadas).toContainEqual(['order', 'prioridad'])
    expect(consulta.llamadas).toContainEqual(['order', 'creado_en'])
    expect(datos.features[0].geometry.coordinates).toEqual([-103.36, 20.68])
    expect(datos.features[1].properties).toMatchObject({
      id: 2,
      prioridad: 3,
      estado: 'asignado',
      bloqueoId: 10,
      brigadaId: 7,
      brigadaNombre: 'Brigada Ejemplo Norte',
    })
    expect(actualizadoEn).toBe(Date.parse('2026-10-17T15:30:00+00:00'))
  })
})

describe('obtenerBrigadas', () => {
  it('entrega la base en [longitud, latitud] con estado, miembros y si es mía', async () => {
    cliente.respuestas.vistas.brigadas_vista = { data: filasBrigadasEjemplo, error: null }

    const { datos } = await obtenerBrigadas()

    expect(datos.features[0].geometry.coordinates).toEqual([-103.41, 20.72])
    expect(datos.features[0].properties).toMatchObject({ estado: 'asignada', incidenteId: 2, miembros: 3, esMia: true })
    expect(datos.features[1].properties).toMatchObject({ estado: 'disponible', incidenteId: null, esMia: false })
  })
})

describe('obtenerMiAsignacion', () => {
  it('arma la brigada y el incidente con [longitud, latitud]', async () => {
    cliente.respuestas.rpc.mi_asignacion = { data: [filaMiAsignacionEjemplo], error: null }

    const { datos } = await obtenerMiAsignacion()

    expect(datos.brigada).toEqual({ id: 7, nombre: 'Brigada Ejemplo Norte', estado: 'asignada', base: [-103.41, 20.72] })
    expect(datos.incidente).toMatchObject({ id: 2, tipo: 'derrumbe', posicion: [-103.4, 20.7] })
  })

  it('sin incidente deja incidente en null', async () => {
    cliente.respuestas.rpc.mi_asignacion = {
      data: [{ ...filaMiAsignacionEjemplo, incidente_id: null, brigada_estado: 'disponible' }],
      error: null,
    }
    const { datos } = await obtenerMiAsignacion()
    expect(datos.incidente).toBeNull()
  })

  it('sin brigada devuelve null', async () => {
    cliente.respuestas.rpc.mi_asignacion = { data: [], error: null }
    const { datos } = await obtenerMiAsignacion()
    expect(datos).toBeNull()
  })
})

describe('RPC con coordenadas', () => {
  it('crearIncidente manda p_longitud y p_latitud en ese orden', async () => {
    cliente.respuestas.rpc.crear_incidente = { data: 5, error: null }
    const id = await crearIncidente({ posicion: [-103.36, 20.68], tipo: 'rescate', prioridad: 1, descripcion: 'x', bloqueoId: 10 })

    expect(id).toBe(5)
    expect(cliente.rpc).toHaveBeenCalledWith('crear_incidente', {
      p_longitud: -103.36,
      p_latitud: 20.68,
      p_tipo: 'rescate',
      p_prioridad: 1,
      p_descripcion: 'x',
      p_bloqueo_id: 10,
    })
  })

  it('guardarBrigada manda la base en [longitud, latitud]', async () => {
    await guardarBrigada({ nombre: 'Alfa', base: [-103.35, 20.67] })
    expect(cliente.rpc).toHaveBeenCalledWith('guardar_brigada', {
      p_id: null,
      p_nombre: 'Alfa',
      p_vehiculo: null,
      p_longitud: -103.35,
      p_latitud: 20.67,
    })
  })
})

describe('demás RPC', () => {
  it('cada función llama a su RPC con sus parámetros', async () => {
    await actualizarIncidente({ id: 1, prioridad: 2, descripcion: 'y' })
    await cancelarIncidente(1)
    await asignarBrigada({ incidenteId: 1, brigadaId: 8 })
    await liberarBrigada(8)
    await avanzarAsignacion('en_camino')
    await cambiarServicioBrigada({ id: 8, enServicio: false })
    await asignarMiembro({ usuarioId: 'u1', brigadaId: null })

    expect(cliente.rpc.mock.calls).toEqual([
      ['actualizar_incidente', { p_id: 1, p_prioridad: 2, p_descripcion: 'y' }],
      ['cancelar_incidente', { p_id: 1 }],
      ['asignar_brigada', { p_incidente_id: 1, p_brigada_id: 8 }],
      ['liberar_brigada', { p_brigada_id: 8 }],
      ['avanzar_asignacion', { p_estado: 'en_camino' }],
      ['cambiar_servicio_brigada', { p_id: 8, p_en_servicio: false }],
      ['asignar_miembro', { p_usuario_id: 'u1', p_brigada_id: null }],
    ])
  })

  it('obtenerBrigadistas convierte los nombres de columnas', async () => {
    cliente.respuestas.rpc.brigadistas = {
      data: [{ id: 'u1', correo: 'b@x.mx', nombre: null, brigada_id: 7 }],
      error: null,
    }
    await expect(obtenerBrigadistas()).resolves.toEqual([{ id: 'u1', correo: 'b@x.mx', nombre: null, brigadaId: 7 }])
  })

  it.each([
    ['asignar_brigada', () => asignarBrigada({ incidenteId: 1, brigadaId: 8 }), 'BRIGADA_OCUPADA', 'La brigada ya tiene un incidente'],
    ['asignar_brigada', () => asignarBrigada({ incidenteId: 1, brigadaId: 8 }), 'INCIDENTE_ASIGNADO', 'ya tiene una brigada asignada'],
    ['avanzar_asignacion', () => avanzarAsignacion('terminado'), 'TRANSICION_INVALIDA', 'no es posible ahora'],
    ['guardar_brigada', () => guardarBrigada({ nombre: 'A', base: [-103, 20] }), 'NOMBRE_REPETIDO', 'Ya existe una brigada'],
  ])('%s con %s llega en español', async (rpc, llamar, codigo, mensaje) => {
    cliente.respuestas.rpc[rpc] = { data: null, error: { message: codigo } }
    await expect(llamar()).rejects.toThrow(mensaje)
  })
})

describe('suscribirseABrigadas', () => {
  it('escucha el canal privado brigadas-cambios y se puede cancelar', () => {
    const alCambiar = vi.fn()
    const cancelar = suscribirseABrigadas(alCambiar)

    expect(cliente.channel).toHaveBeenCalledWith('brigadas-cambios', { config: { private: true } })
    expect(cliente.canales[0].manejadores[0]).toMatchObject({ tipo: 'broadcast', filtro: { event: 'cambio' } })
    cliente.simularCambio()
    expect(alCambiar).toHaveBeenCalledTimes(1)

    cancelar()
    expect(cliente.removeChannel).toHaveBeenCalled()
  })
})
