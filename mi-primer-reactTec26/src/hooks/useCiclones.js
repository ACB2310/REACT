import { useMemo } from 'react'
import { obtenerCiclonesNhc } from '../services/nhc.js'
import { obtenerCiclonesGdacs } from '../services/gdacs.js'
import { combinarCiclones, eventosGdacsSinNhc } from '../utils/ciclones.js'
import { useDatosPeriodicos } from './useDatosPeriodicos.js'

// Los avisos del NHC salen cada 3 a 6 horas; revisar cada 15 minutos basta
export const INTERVALO_CICLONES_MS = 900000

// Adaptadores a la forma { datos, actualizadoEn } que espera useDatosPeriodicos
async function cargarNhc(opciones) {
  const { actualizadoEn, ...datos } = await obtenerCiclonesNhc(opciones)
  return { datos, actualizadoEn }
}
async function cargarGdacs(opciones) {
  const { eventos, actualizadoEn } = await obtenerCiclonesGdacs(opciones)
  return { datos: eventos, actualizadoEn }
}

// Ciclones de NHC y de GDACS. Cada fuente tiene su propio estado: si una falla,
// se siguen mostrando los datos de la otra.
export function useCiclones() {
  const nhc = useDatosPeriodicos(cargarNhc, INTERVALO_CICLONES_MS)
  const gdacs = useDatosPeriodicos(cargarGdacs, INTERVALO_CICLONES_MS)

  const puntosNhc = nhc.datos?.puntos ?? null
  const eventosGdacs = gdacs.datos

  const ciclones = useMemo(() => combinarCiclones(puntosNhc, eventosGdacs), [puntosNhc, eventosGdacs])
  const soloGdacs = useMemo(() => eventosGdacsSinNhc(puntosNhc, eventosGdacs), [puntosNhc, eventosGdacs])

  return { nhc, gdacs, ciclones, eventosGdacsSinNhc: soloGdacs }
}
