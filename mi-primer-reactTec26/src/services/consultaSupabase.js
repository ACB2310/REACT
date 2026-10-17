import { obtenerCliente } from './supabase.js'
import { revisarRespuesta, traducirErrorSupabase } from './erroresSupabase.js'

// Ayudantes comunes para los servicios que usan Supabase.

// Convierte un texto de fecha de Supabase en milisegundos (o null)
export function aMilisegundos(texto) {
  if (!texto) return null
  const ms = Date.parse(texto)
  return Number.isNaN(ms) ? null : ms
}

// Ejecuta `consulta(cliente)` y devuelve `data`. Cualquier error, incluido el de red,
// sale traducido al español (ver erroresSupabase.js).
// Si Supabase no está configurado, lanza 'Supabase no está configurado'.
export async function pedirASupabase(consulta) {
  const cliente = obtenerCliente()
  let respuesta
  try {
    respuesta = await consulta(cliente)
  } catch (error) {
    throw traducirErrorSupabase(error)
  }
  return revisarRespuesta(respuesta)
}
