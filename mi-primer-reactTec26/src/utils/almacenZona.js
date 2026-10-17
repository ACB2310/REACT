import { distanciaMetros } from './geo.js'

// Guarda en el teléfono las calles y puntos de reunión de la zona de la persona,
// para poder calcular la ruta de evacuación SIN conexión.
// Se usa localStorage: puede estar lleno o bloqueado (modo privado), así que cada
// lectura y escritura va dentro de try/catch y nunca rompe la app.

// Si cambia el formato de lo guardado, se cambia la versión y lo viejo se ignora
export const CLAVE_ZONA = 'zonaEvacuacion:v1'

// La zona guardada solo sirve si la persona está cerca de donde se descargó...
const DISTANCIA_MAXIMA_M = 500
// ...y si no es muy vieja (las calles y puntos de reunión cambian poco, pero cambian)
const EDAD_MAXIMA_MS = 7 * 24 * 3600000

function esCoordenada(valor) {
  return Array.isArray(valor) && Number.isFinite(valor[0]) && Number.isFinite(valor[1])
}

// Tolerancia por si el reloj del teléfono va un poco atrasado respecto a cuando se descargó
const TOLERANCIA_RELOJ_MS = 24 * 3600000

// ¿Lo leído es una zona completa y sin daños? Si no, se ignora en lugar de calcular
// una ruta sobre una red de calles rota.
function tieneFormaDeZona(zona) {
  if (!esCoordenada(zona?.centro) || !Number.isFinite(zona.descargadoEn)) return false
  const nodos = zona.grafo?.nodos
  if (typeof nodos !== 'object' || nodos === null || Array.isArray(nodos)) return false
  if (!Array.isArray(zona.grafo.aristas) || !Array.isArray(zona.puntosReunion)) return false

  // Cada nodo con coordenadas numéricas
  if (!Object.values(nodos).every((nodo) => esCoordenada(nodo?.coordenadas))) return false
  // Cada calle une dos nodos que existen
  if (!zona.grafo.aristas.every((a) => nodos[a?.desde] && nodos[a?.hasta])) return false
  // Cada punto de reunión tiene coordenadas y está pegado a un nodo que existe
  return zona.puntosReunion.every((p) => esCoordenada(p?.coordenadas) && nodos[p?.nodoId])
}

// Guarda la zona. Devuelve true si se pudo y false si no (almacenamiento lleno, bloqueado o datos inválidos).
export function guardarZona({ centro, descargadoEn, grafo, puntosReunion }) {
  const zona = { centro, descargadoEn, grafo, puntosReunion }
  if (!tieneFormaDeZona(zona)) return false
  try {
    localStorage.setItem(CLAVE_ZONA, JSON.stringify(zona))
    return true
  } catch {
    return false
  }
}

// Lee la zona guardada si sirve para la ubicación actual; si no, devuelve null.
export function leerZona(centroActual, ahoraMs) {
  let zona
  try {
    const texto = localStorage.getItem(CLAVE_ZONA)
    if (!texto) return null
    zona = JSON.parse(texto)
  } catch {
    // JSON roto o localStorage bloqueado
    return null
  }
  if (!tieneFormaDeZona(zona) || !esCoordenada(centroActual)) return null
  if (distanciaMetros(zona.centro, centroActual) > DISTANCIA_MAXIMA_M) return null
  // Sin hora actual válida no se puede saber qué tan vieja es: no se usa
  if (!Number.isFinite(ahoraMs)) return null
  const edad = ahoraMs - zona.descargadoEn
  if (edad > EDAD_MAXIMA_MS || edad < -TOLERANCIA_RELOJ_MS) return null
  return zona
}
