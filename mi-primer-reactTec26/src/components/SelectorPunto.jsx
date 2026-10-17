import { useEffect, useRef } from 'react'
import { Marker } from 'maplibre-gl'

// Deja elegir un punto en el mapa: con un toque se pone un marcador, que
// también se puede arrastrar para ajustarlo.
// `posicion` es [longitud, latitud] o null; `alCambiar([longitud, latitud])` avisa el cambio.
// `alTocar` (opcional) recibe los toques en el mapa en lugar de `alCambiar`, por ejemplo para
// acercar el mapa antes de aceptar el punto. Arrastrar el marcador siempre usa `alCambiar`.
function SelectorPunto({ mapa, posicion, alCambiar, alTocar }) {
  const marcadorRef = useRef(null)
  const alCambiarRef = useRef(alCambiar)
  const alTocarRef = useRef(alTocar)
  useEffect(() => {
    alCambiarRef.current = alCambiar
    alTocarRef.current = alTocar
  }, [alCambiar, alTocar])

  // Escucha los toques en el mapa
  useEffect(() => {
    if (!mapa) return
    function alTocarMapa(evento) {
      // MapLibre entrega { lng, lat }; aquí se arma [longitud, latitud]
      const punto = [evento.lngLat.lng, evento.lngLat.lat]
      if (alTocarRef.current) alTocarRef.current(punto)
      else alCambiarRef.current?.(punto)
    }
    mapa.on('click', alTocarMapa)
    return () => mapa.off('click', alTocarMapa)
  }, [mapa])

  // Crea, mueve o quita el marcador según `posicion`
  useEffect(() => {
    if (!mapa) return
    if (!posicion) {
      marcadorRef.current?.remove()
      marcadorRef.current = null
      return
    }
    if (!marcadorRef.current) {
      const marcador = new Marker({ draggable: true, color: '#1d4ed8' })
      marcador.on('dragend', () => {
        const { lng, lat } = marcador.getLngLat()
        alCambiarRef.current?.([lng, lat])
      })
      marcador.setLngLat(posicion).addTo(mapa)
      marcadorRef.current = marcador
    } else {
      marcadorRef.current.setLngLat(posicion)
    }
  }, [mapa, posicion])

  // Al salir de la pantalla se quita el marcador
  useEffect(() => {
    return () => {
      marcadorRef.current?.remove()
      marcadorRef.current = null
    }
  }, [])

  return null
}

export default SelectorPunto
