import { describe, it, expect } from 'vitest'
import { dentroDeCaja } from './geo.js'

const CAJA = [-118.5, 14.0, -86.0, 33.0]

describe('dentroDeCaja', () => {
  it('acepta un punto dentro y uno justo en el borde', () => {
    expect(dentroDeCaja([-99.1, 19.4], CAJA)).toBe(true)
    expect(dentroDeCaja([-118.5, 33.0], CAJA)).toBe(true)
  })

  it('rechaza un punto fuera', () => {
    expect(dentroDeCaja([142, 38], CAJA)).toBe(false)
  })

  it('rechaza coordenadas invertidas [lat, lon]', () => {
    expect(dentroDeCaja([19.4, -99.1], CAJA)).toBe(false)
  })

  it('rechaza coordenadas faltantes', () => {
    expect(dentroDeCaja(undefined, CAJA)).toBe(false)
    expect(dentroDeCaja([], CAJA)).toBe(false)
  })
})
