import { obtenerZonas, suscribirseAZonas } from '../services/zonas.js'
import { supabaseConfigurado, MENSAJE_SIN_CONFIGURAR } from '../services/supabase.js'
import { useDatosPeriodicos } from './useDatosPeriodicos.js'
import { useAvisosTiempoReal } from './useAvisosTiempoReal.js'

// Las zonas llegan por tiempo real; esta recarga es solo de respaldo
export const INTERVALO_ZONAS_MS = 300000

// Zonas de peligro activas (FeatureCollection de polígonos). Las ve todo el mundo.
export function useZonasPeligro() {
  const { datos, ...resto } = useDatosPeriodicos(obtenerZonas, INTERVALO_ZONAS_MS, { activo: supabaseConfigurado })
  useAvisosTiempoReal(suscribirseAZonas, resto.recargar, supabaseConfigurado)
  const estadoCarga = supabaseConfigurado ? resto : { ...resto, estado: 'error', error: MENSAJE_SIN_CONFIGURAR }
  return { ...estadoCarga, zonas: datos }
}
