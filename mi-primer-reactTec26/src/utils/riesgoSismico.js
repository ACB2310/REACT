import { distanciaPuntoSegmentoKm } from './geo.js'

// A partir de esta magnitud, un tramo dentro del radio crítico queda BLOQUEADO
export const MAGNITUD_FUERTE = 6.0

// Solo cuentan los sismos de las últimas 72 horas: después de eso el riesgo
// de réplicas fuertes cerca del epicentro baja mucho
export const SISMOS_ACTIVOS_HORAS = 72

// Distancia (km) hasta donde un sismo hace más riesgosa una calle.
// Crece con la magnitud: M 2.5 → 0.56 km, M 5.2 → 12.6 km, M 6.3 → 44.7 km.
export function radioInfluenciaKm(mag) {
  return 10 ** (0.5 * mag - 1.5)
}

// Zona más cercana al epicentro (una cuarta parte del radio de influencia).
// Si el sismo es fuerte, ningún tramo dentro de ella se usa para evacuar.
export function radioCriticoKm(mag) {
  return radioInfluenciaKm(mag) / 4
}

// Cuánto riesgo agregan los sismos a un tramo de calle [a, b] (cada punto en [lon, lat]).
// - 0: ningún sismo cerca.
// - Un número positivo: se suma el aporte de cada sismo cercano; más grande
//   cuanto más fuerte y más cerca está el sismo.
// - Infinity: el tramo pasa por el radio crítico de un sismo fuerte (bloqueado).
export function factorRiesgoSismico([a, b], sismos) {
  let factor = 0
  for (const sismo of sismos?.features ?? []) {
    const mag = sismo.properties?.mag
    // Sin magnitud no se puede estimar el riesgo: ese sismo no aporta
    if (typeof mag !== 'number' || Number.isNaN(mag)) continue
    const epicentro = sismo.geometry?.coordinates
    if (!epicentro) continue

    const distanciaKm = distanciaPuntoSegmentoKm(epicentro.slice(0, 2), a, b)
    if (mag >= MAGNITUD_FUERTE && distanciaKm <= radioCriticoKm(mag)) return Infinity

    const radio = radioInfluenciaKm(mag)
    if (distanciaKm < radio) {
      factor += (mag / 2) * (1 - distanciaKm / radio)
    }
  }
  return factor
}

// Deja solo los sismos de las últimas `horas` horas (usa properties.time en ms).
// No se descartan sismos "del futuro": si el reloj del teléfono va atrasado,
// un sismo de hace un minuto parecería posterior y no debe ignorarse.
export function filtrarSismosActivos(coleccion, ahoraMs, horas = SISMOS_ACTIVOS_HORAS) {
  const limite = ahoraMs - horas * 3600000
  const features = (coleccion?.features ?? []).filter((sismo) => {
    const tiempo = sismo.properties?.time
    return typeof tiempo === 'number' && tiempo >= limite
  })
  return { type: 'FeatureCollection', features }
}
