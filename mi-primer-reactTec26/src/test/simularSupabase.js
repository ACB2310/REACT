// SOLO PARA PRUEBAS: valores por defecto de los hooks de Supabase en la página Mapa
import { vi } from 'vitest'

const VACIA = { type: 'FeatureCollection', features: [] }

export function estadoSupabase(valores = {}) {
  return {
    estado: 'listo',
    error: null,
    actualizadoEn: null,
    consultadoEn: null,
    sinConexion: false,
    recargar: vi.fn(),
    ...valores,
  }
}

// Refugios y bloqueos listos y vacíos, y un ciudadano sin sesión
export function simularSupabaseListo({ useRefugios, useBloqueos, useSesion }, { refugios = {}, bloqueos = {}, sesion = {} } = {}) {
  useRefugios.mockReturnValue(estadoSupabase({ refugios: VACIA, lista: [], ...refugios }))
  useBloqueos.mockReturnValue(estadoSupabase({ bloqueos: VACIA, ...bloqueos }))
  useSesion.mockReturnValue({ rol: 'ciudadano', configurado: true, ...sesion })
}
