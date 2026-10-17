import { describe, it, expect } from 'vitest'
import { traducirErrorSupabase, revisarRespuesta } from './erroresSupabase.js'

// Así llegan los errores de las funciones SQL a través de Supabase
function errorPostgres(message) {
  return { message, code: 'P0001', details: null, hint: null }
}

describe('traducirErrorSupabase', () => {
  it.each([
    ['LIMITE_REPORTES', 'Ya enviaste 5 reportes en la última hora. Espera un poco antes de enviar otro.'],
    ['FUERA_DE_MEXICO', 'El punto está fuera de México. Revisa la ubicación.'],
    ['SIN_PERMISO', 'No tienes permiso para hacer esto.'],
    ['NO_EXISTE', 'El bloqueo ya no existe o ya venció.'],
    ['SIN_SESION', 'No se pudo iniciar una sesión para enviar el reporte.'],
    ['LIMITE_ZONA', 'Ya hay muchos reportes sin confirmar en esta zona. Si es urgente, avisa a Protección Civil o a un brigadista.'],
    ['RENOVACION_LIMITE', 'Este reporte ya no se puede renovar. Si el bloqueo sigue, repórtalo de nuevo.'],
    ['BRIGADA_OCUPADA', 'La brigada ya tiene un incidente o no está disponible.'],
    ['INCIDENTE_ASIGNADO', 'Ese incidente ya tiene una brigada asignada.'],
    ['INCIDENTE_CERRADO', 'El incidente ya no existe o ya está atendido o cancelado.'],
    ['TRANSICION_INVALIDA', 'Ese cambio de estado no es posible ahora.'],
    ['SIN_BRIGADA', 'Tu cuenta no pertenece a ninguna brigada. Pide al coordinador que te agregue.'],
    ['NOMBRE_REPETIDO', 'Ya existe una brigada con ese nombre.'],
    ['BRIGADA_NO_EXISTE', 'La brigada ya no existe.'],
    ['NO_ES_BRIGADISTA', 'Esa cuenta no tiene rol de brigadista.'],
    ['LIMITE_RUTAS', 'Ya pediste muchas rutas en la última hora. Espera unos minutos.'],
    ['ZONA_INVALIDA', 'La zona no es válida: revisa que sus lados no se crucen.'],
    ['ZONA_GRANDE', 'La zona es demasiado grande (máximo 20 km²). Divídela en varias.'],
    ['ZONA_NO_EXISTE', 'La zona ya no existe o ya estaba desactivada.'],
    ['ORS_LIMITE', 'El servicio de rutas llegó a su límite de hoy.'],
    ['ORS_LLAVE', 'El servicio de rutas no está configurado.'],
  ])('traduce %s', (codigo, mensaje) => {
    expect(traducirErrorSupabase(errorPostgres(codigo)).message).toBe(mensaje)
  })

  it('traduce el fallo de red', () => {
    expect(traducirErrorSupabase({ message: 'TypeError: Failed to fetch' }).message).toBe(
      'No se pudo conectar con Supabase',
    )
    expect(traducirErrorSupabase(new TypeError('Load failed')).message).toBe('No se pudo conectar con Supabase')
  })

  it('traduce el tiempo límite', () => {
    expect(traducirErrorSupabase({ message: 'TimeoutError: signal timed out' }).message).toBe(
      'Supabase tardó demasiado en responder',
    )
  })

  it('una cancelación sigue siendo AbortError', () => {
    expect(traducirErrorSupabase({ message: 'AbortError: The operation was aborted.' }).name).toBe('AbortError')
  })

  it('no muestra detalles técnicos de otros errores', () => {
    const traducido = traducirErrorSupabase(errorPostgres('relation "bloqueos_vista" does not exist'))
    expect(traducido.message).toBe('Supabase respondió con un error')
    expect(traducido.cause.message).toContain('bloqueos_vista')
  })
})

describe('revisarRespuesta', () => {
  it('devuelve data si no hay error', () => {
    expect(revisarRespuesta({ data: [1], error: null })).toEqual([1])
  })

  it('lanza el error traducido', () => {
    expect(() => revisarRespuesta({ data: null, error: errorPostgres('SIN_PERMISO') })).toThrow(
      'No tienes permiso para hacer esto.',
    )
  })
})

describe('traducirErrorSupabase: códigos que contienen a otros', () => {
  it('BRIGADA_NO_EXISTE no se confunde con NO_EXISTE (bloqueos)', () => {
    expect(traducirErrorSupabase(errorPostgres('BRIGADA_NO_EXISTE')).message).toBe('La brigada ya no existe.')
  })

  it('reconoce el código aunque venga con texto alrededor', () => {
    expect(traducirErrorSupabase({ message: 'ERROR: P0001: SIN_BRIGADA' }).message).toContain('no pertenece a ninguna brigada')
  })
})
