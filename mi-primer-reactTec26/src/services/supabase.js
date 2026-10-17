import { createClient } from '@supabase/supabase-js'
import { TIEMPO_LIMITE_MS } from './http.js'

// Cliente de Supabase (base de datos, sesión y tiempo real).
// Solo usa la URL y la Publishable key, que son públicas: lo que protege
// los datos son las políticas RLS de supabase/migrations/.
// La Secret key NUNCA va en el frontend.

// fetch con tiempo límite: con mala señal una petición puede quedarse colgada.
// Se combina con la señal de quien llama (por ejemplo, al salir de la pantalla).
function fetchConTiempoLimite(url, opciones = {}) {
  const senales = [AbortSignal.timeout(TIEMPO_LIMITE_MS)]
  if (opciones.signal) senales.push(opciones.signal)
  return fetch(url, { ...opciones, signal: AbortSignal.any(senales) })
}

// Crea el cliente con las variables de entorno. Devuelve null si falta alguna,
// para que la app siga funcionando (sismos y ciclones) sin Supabase.
export function crearClienteSupabase(variables) {
  const url = variables.VITE_SUPABASE_URL
  const llave = variables.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !llave) return null
  return createClient(url, llave, { global: { fetch: fetchConTiempoLimite } })
}

export const supabase = crearClienteSupabase(import.meta.env)
export const supabaseConfigurado = supabase !== null

export const MENSAJE_SIN_CONFIGURAR = 'Supabase no está configurado'

// Para los servicios: devuelve el cliente o lanza un error claro si no hay
export function obtenerCliente() {
  if (!supabase) throw new Error(MENSAJE_SIN_CONFIGURAR)
  return supabase
}
