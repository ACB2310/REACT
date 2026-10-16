import { obtenerSismos } from '../services/usgs.js'
import { useDatosPeriodicos } from './useDatosPeriodicos.js'

// Cada cuánto se vuelven a pedir los sismos: 5 minutos.
// No es más seguido para cuidar la batería y los datos del celular.
export const INTERVALO_ACTUALIZACION_MS = 300000

// Adapta lo que devuelve el servicio de USGS a la forma que espera useDatosPeriodicos
async function cargarSismos(opciones) {
  const { coleccion, generadoEn } = await obtenerSismos(opciones)
  return { datos: coleccion, actualizadoEn: generadoEn }
}

// Hook que entrega los sismos de USGS y el estado de la carga
export function useSismos() {
  const { datos, ...resto } = useDatosPeriodicos(cargarSismos, INTERVALO_ACTUALIZACION_MS)
  return { sismos: datos, ...resto }
}
