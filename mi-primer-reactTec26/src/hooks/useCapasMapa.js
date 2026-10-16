import { useEffect, useRef } from 'react'

// Agrega fuentes y capas propias a un mapa de MapLibre y las mantiene:
// - las vuelve a agregar cuando el mapa cambia de estilo (por ejemplo, a modo oscuro),
//   porque MapLibre borra las capas propias al cambiar de estilo;
// - las oculta o muestra según `visible`;
// - las quita al salir de la pantalla.
//
// Configuración:
// - fuentes: [{ id, definicion: () => objetoFuente }]  (función para leer siempre los datos más recientes)
// - capas:   objetos de capa de MapLibre; cada uno puede traer `antesDe` (id de capa o
//            función (mapa) => id) para quedar debajo de esa capa
// - clics:   { idCapa: (evento) => void }
// - visible: true o false
export function useCapasMapa(mapa, configuracion) {
  // Siempre se usa la configuración más reciente (datos, visibilidad, manejadores)
  const configuracionRef = useRef(configuracion)
  useEffect(() => {
    configuracionRef.current = configuracion
  })

  const visible = configuracion.visible ?? true

  // Efecto principal: agrega todo cuando llega el mapa y lo quita al salir
  useEffect(() => {
    if (!mapa) return

    function aplicarVisibilidad() {
      const { capas, visible: esVisible = true } = configuracionRef.current
      for (const capa of capas) {
        if (mapa.getLayer(capa.id)) {
          mapa.setLayoutProperty(capa.id, 'visibility', esVisible ? 'visible' : 'none')
        }
      }
    }

    // Agrega fuentes y capas si todavía no existen
    function agregar() {
      const { fuentes, capas } = configuracionRef.current
      if (fuentes.length === 0 || mapa.getSource(fuentes[0].id)) return
      for (const fuente of fuentes) {
        mapa.addSource(fuente.id, fuente.definicion())
      }
      for (const { antesDe, ...capa } of capas) {
        const idDebajo = typeof antesDe === 'function' ? antesDe(mapa) : antesDe
        if (idDebajo && mapa.getLayer(idDebajo)) mapa.addLayer(capa, idDebajo)
        else mapa.addLayer(capa)
      }
      aplicarVisibilidad()
    }

    agregar()
    mapa.on('style.load', agregar)

    // Los clics se registran una sola vez: MapLibre los conserva aunque cambie el estilo
    const clics = Object.keys(configuracionRef.current.clics ?? {}).map((idCapa) => [
      idCapa,
      (evento) => configuracionRef.current.clics?.[idCapa]?.(evento),
    ])
    for (const [idCapa, manejador] of clics) mapa.on('click', idCapa, manejador)

    return () => {
      mapa.off('style.load', agregar)
      for (const [idCapa, manejador] of clics) mapa.off('click', idCapa, manejador)
      try {
        const { fuentes, capas } = configuracionRef.current
        for (const capa of [...capas].reverse()) {
          if (mapa.getLayer(capa.id)) mapa.removeLayer(capa.id)
        }
        for (const fuente of fuentes) {
          if (mapa.getSource(fuente.id)) mapa.removeSource(fuente.id)
        }
      } catch {
        // Si MapaBase ya eliminó el mapa, no queda nada que limpiar
      }
    }
  }, [mapa])

  // Muestra u oculta las capas cuando cambia `visible`
  useEffect(() => {
    if (!mapa) return
    for (const capa of configuracionRef.current.capas) {
      if (mapa.getLayer(capa.id)) {
        mapa.setLayoutProperty(capa.id, 'visibility', visible ? 'visible' : 'none')
      }
    }
  }, [mapa, visible])
}
