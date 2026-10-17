// Funciones geográficas sencillas. Las coordenadas siempre van en [longitud, latitud].

// ¿El punto está dentro de la caja [oeste, sur, este, norte]? Los bordes cuentan como dentro.
export function dentroDeCaja(coordenadas, [oeste, sur, este, norte]) {
  const [longitud, latitud] = coordenadas ?? []
  if (typeof longitud !== 'number' || typeof latitud !== 'number') return false
  return longitud >= oeste && longitud <= este && latitud >= sur && latitud <= norte
}

// Caja donde se aceptan reportes de bloqueos y ubicaciones de refugios: [oeste, sur, este, norte].
// Debe ser IGUAL a la función SQL dentro_de_mexico() (supabase/migrations/…_refugios.sql).
// Es más ajustada que BBOX_MEXICO de utils/sismos.js, que incluye "alrededores".
export const BBOX_REPORTES_MEXICO = [-118.6, 14.3, -86.5, 32.8]
