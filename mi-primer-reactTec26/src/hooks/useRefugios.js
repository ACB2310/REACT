import { obtenerRefugios } from '../services/refugios.js'
import { supabaseConfigurado, MENSAJE_SIN_CONFIGURAR } from '../services/supabase.js'
import { useDatosPeriodicos } from './useDatosPeriodicos.js'

// Los refugios cambian poco (estado y ocupación): se revisan cada 10 minutos
export const INTERVALO_REFUGIOS_MS = 600000

// Adapta el servicio a la forma que espera useDatosPeriodicos
async function cargarRefugios(opciones) {
  const { datos, refugios, actualizadoEn } = await obtenerRefugios(opciones)
  return { datos: { coleccion: datos, lista: refugios }, actualizadoEn }
}

// Entrega:
// - refugios: FeatureCollection de los que tienen ubicación (para el mapa)
// - lista: todos, incluidos los que el coordinador aún no ubica
// - y el estado de la carga (estado, error, actualizadoEn, recargar...)
export function useRefugios() {
  const { datos, ...resto } = useDatosPeriodicos(cargarRefugios, INTERVALO_REFUGIOS_MS, {
    activo: supabaseConfigurado,
  })
  // Sin Supabase no se pide nada: se avisa una vez en lugar de reintentar
  const estadoCarga = supabaseConfigurado ? resto : { ...resto, estado: 'error', error: MENSAJE_SIN_CONFIGURAR }
  return { ...estadoCarga, refugios: datos?.coleccion ?? null, lista: datos?.lista ?? null }
}
