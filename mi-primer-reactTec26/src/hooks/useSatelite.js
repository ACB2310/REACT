import { obtenerHoraSatelite } from '../services/gibs.js'
import { useDatosPeriodicos } from './useDatosPeriodicos.js'

// GOES-East publica una imagen nueva cada 10 minutos
export const INTERVALO_SATELITE_MS = 600000

// Hora de la imagen de satélite más reciente. Solo se pide con la capa prendida,
// para no gastar datos ni batería si nadie la está viendo.
export function useSatelite(activo) {
  return useDatosPeriodicos(obtenerHoraSatelite, INTERVALO_SATELITE_MS, { activo })
}
