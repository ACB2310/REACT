import { useEffect } from 'react'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import { urlTeselasSatelite } from '../services/gibs.js'

// La imagen de satélite va debajo de los nombres de ciudades del mapa base,
// para que se sigan leyendo encima de las nubes
function primeraCapaDeNombres(mapa) {
  return mapa.getStyle()?.layers?.find((capa) => capa.type === 'symbol')?.id
}

// Imagen de satélite GOES-East (nubes) de NASA GIBS.
// `hora` es la hora de la imagen más reciente; sin hora no se dibuja nada.
function CapaSatelite({ mapa, hora, visible = true }) {
  useCapasMapa(hora ? mapa : null, {
    fuentes: [
      {
        id: 'satelite',
        definicion: () => ({
          type: 'raster',
          tiles: [urlTeselasSatelite(hora)],
          tileSize: 256,
          // GIBS solo tiene esta capa hasta el nivel de acercamiento 7
          maxzoom: 7,
          attribution: 'Imágenes: NASA GIBS / NOAA GOES-East',
        }),
      },
    ],
    capas: [
      {
        id: 'satelite',
        type: 'raster',
        source: 'satelite',
        paint: { 'raster-opacity': 0.8 },
        antesDe: primeraCapaDeNombres,
      },
    ],
    visible,
  })

  // Cuando GIBS publica una imagen nueva, se cambian las teselas
  useEffect(() => {
    if (!mapa || !hora) return
    mapa.getSource('satelite')?.setTiles([urlTeselasSatelite(hora)])
  }, [mapa, hora])

  return null
}

export default CapaSatelite
