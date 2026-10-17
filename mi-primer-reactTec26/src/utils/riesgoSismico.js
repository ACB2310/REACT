import { agrandarCaja, cajaDeGeometria, cajasSeTocan, distanciaPuntoSegmentoKm } from './geo.js'

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

// Revisa y prepara los sismos UNA sola vez, para no repetir el trabajo en cada una
// de las miles de calles. Acepta un FeatureCollection o una lista simple de Features.
// Devuelve [{ mag, epicentro, radioInfluencia, radioCritico, caja }] solo con sismos válidos.
export function prepararSismos(sismos) {
  const lista = Array.isArray(sismos) ? sismos : (sismos?.features ?? [])
  const preparados = []
  for (const sismo of lista) {
    // Se acepta la magnitud como número o como texto ("6.3"): un sismo fuerte
    // no debe contar como "sin sismo" solo por cómo vino escrito
    const valorMag = sismo?.properties?.mag
    const mag = typeof valorMag === 'string' && valorMag.trim() !== '' ? Number(valorMag) : valorMag
    // Sin magnitud no se puede estimar el riesgo: ese sismo no aporta.
    // Las magnitudes de 0 o menos (micro-sismos) tampoco: nunca deben BAJAR el riesgo.
    if (typeof mag !== 'number' || Number.isNaN(mag) || mag <= 0) continue

    // USGS manda [longitud, latitud, profundidad]; solo se usan las dos primeras
    const [longitud, latitud] = (sismo.geometry?.coordinates ?? []).map(Number)
    // Si no se sabe dónde fue, no se puede medir: se ignora ese sismo sin romper los demás
    if (!Number.isFinite(longitud) || !Number.isFinite(latitud)) continue

    const radioInfluencia = radioInfluenciaKm(mag)
    preparados.push({
      mag,
      epicentro: [longitud, latitud],
      radioInfluencia,
      radioCritico: radioCriticoKm(mag),
      // Caja de influencia: sirve para descartar rápido las calles lejanas
      caja: agrandarCaja([longitud, latitud, longitud, latitud], radioInfluencia),
    })
  }
  return preparados
}

// Igual que factorRiesgoSismico, pero con sismos ya preparados (más rápido en un grafo grande)
export function factorRiesgoConSismosPreparados([a, b], preparados) {
  let factor = 0
  const cajaTramo = cajaDeGeometria({ type: 'LineString', coordinates: [a, b] })
  for (const { mag, epicentro, radioInfluencia, radioCritico, caja } of preparados) {
    // Atajo rápido: si el tramo está fuera de la caja de influencia del sismo, no hace
    // falta medir con precisión (medir con Turf es lo lento cuando hay miles de calles)
    if (!cajasSeTocan(cajaTramo, caja)) continue

    const distanciaKm = distanciaPuntoSegmentoKm(epicentro, a, b)
    if (mag >= MAGNITUD_FUERTE && distanciaKm <= radioCritico) return Infinity
    if (distanciaKm < radioInfluencia) {
      factor += Math.max(0, (mag / 2) * (1 - distanciaKm / radioInfluencia))
    }
  }
  return factor
}

// Cuánto riesgo agregan los sismos a un tramo de calle [a, b] (cada punto en [lon, lat]).
// - 0: ningún sismo cerca.
// - Un número positivo: se suma el aporte de cada sismo cercano; más grande
//   cuanto más fuerte y más cerca está el sismo.
// - Infinity: el tramo pasa por el radio crítico de un sismo fuerte (bloqueado).
export function factorRiesgoSismico(tramo, sismos) {
  return factorRiesgoConSismosPreparados(tramo, prepararSismos(sismos))
}

// Deja solo los sismos de las últimas `horas` horas (usa properties.time en ms).
// Ante la duda se CONSERVA el sismo, porque es más seguro considerar uno de más:
// - los sismos "del futuro" se quedan (el reloj del teléfono puede ir atrasado);
// - los sismos sin hora válida se quedan;
// - si la hora actual o las horas no son válidas, se quedan todos.
export function filtrarSismosActivos(coleccion, ahoraMs, horas = SISMOS_ACTIVOS_HORAS) {
  const features = coleccion?.features ?? []
  const limite = ahoraMs - horas * 3600000
  if (!Number.isFinite(limite)) return { type: 'FeatureCollection', features: [...features] }

  const activos = features.filter((sismo) => {
    const tiempo = sismo.properties?.time
    if (typeof tiempo !== 'number' || !Number.isFinite(tiempo)) return true
    return tiempo >= limite
  })
  return { type: 'FeatureCollection', features: activos }
}
