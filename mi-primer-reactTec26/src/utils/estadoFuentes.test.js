import { describe, it, expect } from 'vitest'
import { resumirEstadoFuentes } from './estadoFuentes.js'

describe('resumirEstadoFuentes', () => {
  it('sin conexión gana sobre todo lo demás', () => {
    expect(resumirEstadoFuentes([{ estado: 'error' }], { sinConexion: true })).toEqual({
      tipo: 'sin-conexion',
      texto: 'Sin conexión',
    })
  })

  it('cuenta las fuentes con error en singular y plural', () => {
    expect(resumirEstadoFuentes([{ estado: 'error' }, { estado: 'listo' }]).texto).toBe('1 fuente con error')
    expect(resumirEstadoFuentes([{ estado: 'error' }, { estado: 'error' }]).texto).toBe('2 fuentes con error')
  })

  it('un error pesa más que una fuente que sigue cargando', () => {
    expect(resumirEstadoFuentes([{ estado: 'cargando' }, { estado: 'error' }]).tipo).toBe('error')
  })

  it('dice Cargando datos… mientras alguna fuente carga', () => {
    expect(resumirEstadoFuentes([{ estado: 'cargando' }, { estado: 'listo' }])).toEqual({
      tipo: 'cargando',
      texto: 'Cargando datos…',
    })
  })

  it('todo listo (o sin fuentes) es Datos al día', () => {
    expect(resumirEstadoFuentes([{ estado: 'listo' }]).texto).toBe('Datos al día')
    expect(resumirEstadoFuentes([]).texto).toBe('Datos al día')
  })
})
