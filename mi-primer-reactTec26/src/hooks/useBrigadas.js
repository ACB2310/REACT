import { obtenerIncidentes, suscribirseABrigadas } from '../services/incidentes.js'
import { obtenerBrigadas, obtenerMiAsignacion } from '../services/brigadas.js'
import { supabaseConfigurado, MENSAJE_SIN_CONFIGURAR } from '../services/supabase.js'
import { useDatosPeriodicos } from './useDatosPeriodicos.js'
import { useAvisosTiempoReal } from './useAvisosTiempoReal.js'

// Hooks de la etapa 6. Los datos llegan por tiempo real (canal privado brigadas-cambios);
// la recarga cada 2 minutos es solo de respaldo por si se pierde un aviso.
export const INTERVALO_BRIGADAS_MS = 120000

// `activo`: solo brigadistas y coordinadores pueden leer estos datos; para los demás
// no se pide nada (el servidor tampoco se los daría).
function useDatosDeBrigadas(obtener, activo) {
  const encendido = supabaseConfigurado && activo
  const resultado = useDatosPeriodicos(obtener, INTERVALO_BRIGADAS_MS, { activo: encendido })
  useAvisosTiempoReal(suscribirseABrigadas, resultado.recargar, encendido)
  if (!supabaseConfigurado) return { ...resultado, estado: 'error', error: MENSAJE_SIN_CONFIGURAR }
  return resultado
}

// Incidentes abiertos (FeatureCollection), del más urgente al menos urgente
export function useIncidentes(activo) {
  const { datos, ...resto } = useDatosDeBrigadas(obtenerIncidentes, activo)
  return { ...resto, incidentes: datos }
}

// Brigadas con su base (FeatureCollection)
export function useBrigadas(activo) {
  const { datos, ...resto } = useDatosDeBrigadas(obtenerBrigadas, activo)
  return { ...resto, brigadas: datos }
}

// Para el brigadista: { brigada, incidente } o null si no pertenece a ninguna brigada
export function useMiAsignacion(activo) {
  const { datos, ...resto } = useDatosDeBrigadas(obtenerMiAsignacion, activo)
  return { ...resto, asignacion: datos }
}
