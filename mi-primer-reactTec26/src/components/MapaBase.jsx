import { useEffect, useRef } from 'react'
import { Map as MapaMapLibre, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './MapaBase.css'

// Estilos de OpenFreeMap: gratuitos y sin llave
const ESTILO_CLARO = 'https://tiles.openfreemap.org/styles/liberty'
const ESTILO_OSCURO = 'https://tiles.openfreemap.org/styles/dark'

// Centro aproximado de México en [longitud, latitud]
const CENTRO_MEXICO = [-102.5, 23.6]

function sistemaEnModoOscuro() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

// Mapa base de MapLibre. Cuando termina de cargar, entrega el mapa con `alCargar(mapa)`
// para que otras capas (como CapaSismos) puedan dibujar encima.
function MapaBase({ alCargar }) {
  const contenedorRef = useRef(null)

  // Se guarda la última versión de `alCargar` en una ref para no
  // volver a crear el mapa cada vez que el componente padre se redibuja
  const alCargarRef = useRef(alCargar)
  useEffect(() => {
    alCargarRef.current = alCargar
  }, [alCargar])

  // Crea el mapa una sola vez y lo elimina al salir de la pantalla.
  // En StrictMode React monta, desmonta y vuelve a montar: por eso es importante `remove()`.
  useEffect(() => {
    const mapa = new MapaMapLibre({
      container: contenedorRef.current,
      style: sistemaEnModoOscuro() ? ESTILO_OSCURO : ESTILO_CLARO,
      center: CENTRO_MEXICO,
      zoom: 4,
    })
    // La atribución de OpenFreeMap y OpenStreetMap la agrega MapLibre por defecto
    mapa.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapa.on('load', () => alCargarRef.current?.(mapa))

    return () => mapa.remove()
  }, [])

  return <div ref={contenedorRef} className="mapa-base" />
}

export default MapaBase
