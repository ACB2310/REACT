import { useEffect, useRef } from 'react'
import { Marker } from 'maplibre-gl'

// Deja elegir un punto en el mapa: con un toque se pone un marcador, que
// también se puede arrastrar para ajustarlo.
// `posicion` es [longitud, latitud] o null; `alCambiar([longitud, latitud])` avisa el cambio.
function SelectorPunto({ mapa, posicion, alCambiar }) {
  const marcadorRef = useRef(null)
  const alCambiarRef = useRef(alCambiar)
  useEffect(() => {
    alCambiarRef.current = alCambiar
  }, [alCambiar])

  // Escucha los toques en el mapa
  useEffect(() => {
    if (!mapa) return
    function alTocar(evento) {
      // MapLibre entrega { lng, lat }; aquí se arma [longitud, latitud]
      alCambiarRef.current?.([evento.lngLat.lng, evento.lngLat.lat])
    }
    mapa.on('click', alTocar)
    return () => mapa.off('click', alTocar)
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
