// Textos, colores y reglas de las zonas de peligro (etapa 4).
// El área se calcula con la MISMA función que usa la Edge Function `rutas`,
// para que el límite que ve el coordinador sea el mismo que se aplica al calcular rutas.
import { areaKm2 } from '../../supabase/functions/rutas/logica.js'

export const COLORES_SEVERIDAD = { 1: '#dc2626', 2: '#f59e0b' }
export const TEXTOS_SEVERIDAD = {
  1: 'Zona de peligro: las rutas la evitan',
  2: 'Precaución: pasa solo si es necesario',
}
export const ETIQUETAS_SEVERIDAD = { 1: 'Evitar', 2: 'Precaución' }

// Igual que en la migración 6 (máximo por zona, por el límite de OpenRouteService)
export const AREA_MAXIMA_ZONA_KM2 = 20
export const LIMITE_DESCRIPCION_ZONA = 300

// Vigencias que puede elegir el coordinador (null = hasta que la desactive)
export const VIGENCIAS = [
  { horas: 6, etiqueta: '6 horas' },
  { horas: 24, etiqueta: '24 horas' },
  { horas: 72, etiqueta: '3 días' },
  { horas: null, etiqueta: 'Hasta que la desactive' },
]

// Puntos tocados → anillo cerrado [[lng, lat], …, primer punto]. Con menos de 3 puntos: null.
export function cerrarAnillo(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 3) return null
  return [...puntos, puntos[0]]
}

// Área en km² de los puntos tocados (0 si todavía no forman un polígono)
export function areaDePuntos(puntos) {
  const anillo = cerrarAnillo(puntos)
  return anillo ? areaKm2(anillo) : 0
}

// "0.42 km²" o "850 m²" para zonas pequeñas
export function textoArea(km2) {
  if (km2 < 0.01) return `${Math.round(km2 * 1e6)} m²`
  return `${km2.toFixed(2)} km²`
}
