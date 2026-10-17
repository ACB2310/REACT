import { useEffect } from 'react'

// Por muchos avisos que lleguen seguidos, se recarga como máximo una vez cada 5 s
export const RECARGA_MINIMA_MS = 5000

// Escucha avisos de tiempo real con `suscribirse(alAvisar)` y recarga sin mostrar
// "Actualizando…". El primer aviso recarga de inmediato; los que lleguen en los
// siguientes 5 s se juntan en una sola recarga (cuida la batería y el servidor).
// Es la misma regla que usa useBloqueos.
export function useAvisosTiempoReal(suscribirse, recargar, activo) {
  useEffect(() => {
    if (!activo) return
    let ultimaRecarga = 0
    let pendiente = null
    function alAvisar() {
      const espera = RECARGA_MINIMA_MS - (Date.now() - ultimaRecarga)
      if (espera <= 0) {
        ultimaRecarga = Date.now()
        recargar({ silencioso: true })
      } else if (!pendiente) {
        pendiente = setTimeout(() => {
          pendiente = null
          ultimaRecarga = Date.now()
          recargar({ silencioso: true })
        }, espera)
      }
    }
    const cancelar = suscribirse(alAvisar)
    return () => {
      clearTimeout(pendiente)
      cancelar()
    }
  }, [suscribirse, recargar, activo])
}
