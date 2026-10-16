import { describe, it, expect } from 'vitest'
import { crearColaPrioridad } from './colaPrioridad.js'

describe('crearColaPrioridad', () => {
  it('la cola saca siempre el de menor prioridad', () => {
    const cola = crearColaPrioridad()
    cola.agregar('cinco', 5)
    cola.agregar('uno-a', 1)
    cola.agregar('tres', 3)
    cola.agregar('uno-b', 1)

    const prioridades = []
    while (!cola.estaVacia()) prioridades.push(cola.sacarMinimo().prioridad)
    expect(prioridades).toEqual([1, 1, 3, 5])
  })

  it('devuelve el valor junto con su prioridad', () => {
    const cola = crearColaPrioridad()
    cola.agregar('nodo-a', 7)
    expect(cola.sacarMinimo()).toEqual({ valor: 'nodo-a', prioridad: 7 })
  })

  it('la cola vacía devuelve undefined', () => {
    const cola = crearColaPrioridad()
    expect(cola.estaVacia()).toBe(true)
    expect(cola.sacarMinimo()).toBeUndefined()
  })

  // Así la usa Dijkstra: saca un nodo y agrega sus vecinos, una y otra vez
  it('sigue entregando el mínimo al agregar y sacar intercalado', () => {
    const cola = crearColaPrioridad()
    cola.agregar('a', 4)
    cola.agregar('b', 2)
    expect(cola.sacarMinimo().valor).toBe('b')
    cola.agregar('c', 1)
    cola.agregar('d', 5)
    expect(cola.sacarMinimo().valor).toBe('c')
    cola.agregar('e', 3)
    expect(cola.sacarMinimo().valor).toBe('e')
    expect(cola.sacarMinimo().valor).toBe('a')
    expect(cola.sacarMinimo().valor).toBe('d')
    expect(cola.estaVacia()).toBe(true)
  })

  it('ordena bien muchos elementos agregados en desorden', () => {
    const cola = crearColaPrioridad()
    const numeros = [42, 7, 19, 3, 88, 3, 51, 0, 26, 14, 9, 65]
    for (const n of numeros) cola.agregar(n, n)

    const salida = []
    while (!cola.estaVacia()) salida.push(cola.sacarMinimo().valor)
    expect(salida).toEqual([0, 3, 3, 7, 9, 14, 19, 26, 42, 51, 65, 88])
  })
})
