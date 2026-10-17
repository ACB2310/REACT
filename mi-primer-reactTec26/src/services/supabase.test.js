import { describe, it, expect } from 'vitest'
import { crearClienteSupabase } from './supabase.js'

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
