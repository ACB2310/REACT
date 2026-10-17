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
