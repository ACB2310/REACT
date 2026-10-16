// Funciones geográficas sencillas. Las coordenadas siempre van en [longitud, latitud].

// ¿El punto está dentro de la caja [oeste, sur, este, norte]? Los bordes cuentan como dentro.
export function dentroDeCaja(coordenadas, [oeste, sur, este, norte]) {
  const [longitud, latitud] = coordenadas ?? []
  if (typeof longitud !== 'number' || typeof latitud !== 'number') return false
  return longitud >= oeste && longitud <= este && latitud >= sur && latitud <= norte
}
