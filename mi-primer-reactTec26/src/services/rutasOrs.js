import { FunctionsHttpError } from '@supabase/supabase-js'
import { obtenerCliente } from './supabase.js'
import { aMilisegundos } from './consultaSupabase.js'
import { traducirErrorSupabase } from './erroresSupabase.js'

// Ruta al refugio abierto al que se llega más rápido, calculada en línea por la
// Edge Function `rutas` (supabase/functions/rutas) con OpenRouteService.
// La llave de ORS vive en Supabase: el navegador nunca la ve.

// Errores con los que conviene usar la ruta sin conexión (Dijkstra) en lugar de rendirse
export const CODIGOS_PARA_RESPALDO = ['SIN_CONEXION', 'ORS_LIMITE', 'ORS_LLAVE', 'ORS_ERROR', 'FUNCION_NO_DISPONIBLE', 'SUPABASE_ERROR']

const MENSAJE_SIN_CONEXION = 'No se pudo conectar con el servicio de rutas.'
const MENSAJE_NO_DISPONIBLE = 'El servicio de rutas no está disponible.'

// Error con el código de la función, para que el hook decida si usa el respaldo
function errorConCodigo(mensaje, codigo, causa) {
  const error = new Error(mensaje, { cause: causa })
  error.codigo = codigo
  return error
}

async function traducirErrorFuncion(error) {
  if (error?.name === 'AbortError') return error
  if (error instanceof FunctionsHttpError || error?.name === 'FunctionsHttpError') {
    const cuerpo = await error.context?.json?.().catch(() => null)
    const codigo = cuerpo?.codigo
    if (!codigo) return errorConCodigo(MENSAJE_NO_DISPONIBLE, 'FUNCION_NO_DISPONIBLE', error)
    const traducido = traducirErrorSupabase({ message: codigo })
    return errorConCodigo(traducido.message, codigo, error)
  }
  // FunctionsFetchError / FunctionsRelayError / TypeError: no hubo respuesta
  return errorConCodigo(MENSAJE_SIN_CONEXION, 'SIN_CONEXION', error)
}

// origen: [longitud, latitud]; modo: 'a_pie' | 'carro'.
// Devuelve { estado: 'ruta', destino, ruta, resumen, evitados, origenEnZona, consultadoEn }
// o { estado: 'sin-ruta', motivo, consultadoEn }.
export async function calcularRutaRefugio({ origen, modo, signal }) {
  const cliente = obtenerCliente()
  let respuesta
  try {
    respuesta = await cliente.functions.invoke('rutas', { body: { origen, modo }, signal })
  } catch (error) {
    throw await traducirErrorFuncion(error)
  }
  if (respuesta.error) throw await traducirErrorFuncion(respuesta.error)

  const datos = respuesta.data
  if (datos?.estado !== 'ruta' && datos?.estado !== 'sin-ruta') {
    throw errorConCodigo(MENSAJE_NO_DISPONIBLE, 'FUNCION_NO_DISPONIBLE')
  }
  return { ...datos, consultadoEn: aMilisegundos(datos.consultadoEn) ?? Date.now() }
}
