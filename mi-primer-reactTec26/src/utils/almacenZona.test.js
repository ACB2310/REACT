import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CLAVE_ZONA, guardarZona, leerZona } from './almacenZona.js'
import { grafoMonterrey } from '../mocks/grafoEvacuacionEjemplo.js'

const DIA_MS = 24 * 3600000
const AHORA = Date.UTC(2026, 9, 16, 22)
const CENTRO = [-100.31, 25.67]

const zona = {
  centro: CENTRO,
  descargadoEn: AHORA - DIA_MS,
  grafo: grafoMonterrey,
  puntosReunion: [{ id: 'reunion-1', nombre: 'Plaza', coordenadas: [-100.3, 25.67], nodoId: 'm4' }],
}

describe('almacenZona', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('guarda y lee la misma zona', () => {
    expect(guardarZona(zona)).toBe(true)
    expect(leerZona(CENTRO, AHORA)).toEqual(zona)
  })

  it('usa la clave zonaEvacuacion:v1', () => {
    guardarZona(zona)
    expect(CLAVE_ZONA).toBe('zonaEvacuacion:v1')
    expect(localStorage.getItem('zonaEvacuacion:v1')).not.toBeNull()
  })

  it('sirve la zona si la persona se movió poco (≤ 500 m)', () => {
    guardarZona(zona)
    // ~400 m al norte
    expect(leerZona([-100.31, 25.6736], AHORA)).not.toBeNull()
  })

  it('ignora una zona a más de 500 m', () => {
    guardarZona(zona)
    // ~600 m al norte
    expect(leerZona([-100.31, 25.6754], AHORA)).toBeNull()
  })

  it('ignora una zona de más de 7 días', () => {
    guardarZona({ ...zona, descargadoEn: AHORA - 7 * DIA_MS - 1 })
    expect(leerZona(CENTRO, AHORA)).toBeNull()
  })

  it('si la hora actual no es válida no usa la zona', () => {
    guardarZona(zona)
    expect(leerZona(CENTRO, NaN)).toBeNull()
    expect(leerZona(CENTRO, undefined)).toBeNull()
  })

  it('ignora una zona que dice venir de más de un día en el futuro', () => {
    guardarZona({ ...zona, descargadoEn: AHORA + 2 * DIA_MS })
    expect(leerZona(CENTRO, AHORA)).toBeNull()
  })

  it('tolera un reloj un poco atrasado (zona de unas horas "en el futuro")', () => {
    guardarZona({ ...zona, descargadoEn: AHORA + 3 * 3600000 })
    expect(leerZona(CENTRO, AHORA)).not.toBeNull()
  })

  it('ignora una zona con el grafo dañado', () => {
    const danada = (grafo, puntosReunion = zona.puntosReunion) =>
      JSON.stringify({ centro: CENTRO, descargadoEn: AHORA, grafo, puntosReunion })
    const casos = [
      // nodos como lista en lugar de objeto
      danada({ nodos: [], aristas: [] }),
      // nodo sin coordenadas
      danada({ nodos: { ...grafoMonterrey.nodos, m9: { id: 'm9' } }, aristas: grafoMonterrey.aristas }),
      // calle hacia un nodo que no existe
      danada({ nodos: grafoMonterrey.nodos, aristas: [...grafoMonterrey.aristas, { id: 'x', desde: 'm1', hasta: 'm99' }] }),
      // punto de reunión pegado a un nodo que no existe
      danada(grafoMonterrey, [{ id: 'reunion-1', nombre: 'Plaza', coordenadas: [-100.3, 25.67], nodoId: 'm99' }]),
      // punto de reunión sin coordenadas
      danada(grafoMonterrey, [{ id: 'reunion-1', nombre: 'Plaza', nodoId: 'm4' }]),
    ]
    for (const texto of casos) {
      localStorage.setItem(CLAVE_ZONA, texto)
      expect(leerZona(CENTRO, AHORA)).toBeNull()
    }
  })

  it('sin zona guardada da null', () => {
    expect(leerZona(CENTRO, AHORA)).toBeNull()
  })

  it('JSON roto da null', () => {
    localStorage.setItem(CLAVE_ZONA, '{esto no es json')
    expect(leerZona(CENTRO, AHORA)).toBeNull()
  })

  it('una zona con forma inesperada da null', () => {
    localStorage.setItem(CLAVE_ZONA, JSON.stringify({ centro: CENTRO, descargadoEn: AHORA, grafo: null }))
    expect(leerZona(CENTRO, AHORA)).toBeNull()
  })

  it('si localStorage lanza error, guardar da false y leer da null', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Lleno', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Bloqueado', 'SecurityError')
    })
    expect(guardarZona(zona)).toBe(false)
    expect(leerZona(CENTRO, AHORA)).toBeNull()
  })

  it('no guarda una zona sin centro válido', () => {
    expect(guardarZona({ ...zona, centro: [NaN, 25.67] })).toBe(false)
    expect(localStorage.getItem(CLAVE_ZONA)).toBeNull()
  })
})
