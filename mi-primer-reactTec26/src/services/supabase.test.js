import { describe, it, expect } from 'vitest'
import { crearClienteSupabase, tiempoLimitePara } from './supabase.js'
import { TIEMPO_LIMITE_MS } from './http.js'

// La función de rutas puede calcular la ruta combinada (varias consultas a OpenRouteService):
// se le da más tiempo que a una consulta normal
describe('tiempoLimitePara', () => {
  it('las Edge Functions esperan 25 s; lo demás, el tiempo normal', () => {
    expect(tiempoLimitePara('https://x.supabase.co/functions/v1/rutas')).toBe(25000)
    expect(tiempoLimitePara(new URL('https://x.supabase.co/functions/v1/rutas'))).toBe(25000)
    expect(tiempoLimitePara('https://x.supabase.co/rest/v1/refugios_vista?select=*')).toBe(TIEMPO_LIMITE_MS)
    expect(tiempoLimitePara(undefined)).toBe(TIEMPO_LIMITE_MS)
  })
})

describe('crearClienteSupabase', () => {
  it('sin variables queda como no configurado', () => {
    expect(crearClienteSupabase({})).toBeNull()
    expect(crearClienteSupabase({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull()
  })

  it('con URL y Publishable key crea el cliente', () => {
    const cliente = crearClienteSupabase({
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_prueba',
    })
    expect(cliente).not.toBeNull()
    expect(typeof cliente.rpc).toBe('function')
  })
})
