import { useEffect, useMemo, useState } from 'react'
import { obtenerBloqueos, suscribirseABloqueos } from '../services/bloqueos.js'
import { supabaseConfigurado, MENSAJE_SIN_CONFIGURAR } from '../services/supabase.js'
import { useDatosPeriodicos } from './useDatosPeriodicos.js'

// Los bloqueos llegan por tiempo real; esta recarga es solo de respaldo
// por si se pierde algún aviso (por ejemplo, con mala señal).
export const INTERVALO_BLOQUEOS_MS = 120000
// Cada minuto se quitan los que ya vencieron, aunque no haya recargado
export const REVISION_VENCIDOS_MS = 60000
// Por muchos avisos que lleguen seguidos, se recarga como máximo una vez cada 5 s
export const RECARGA_MINIMA_MS = 5000

// Entrega los bloqueos vigentes (`bloqueos`, FeatureCollection) y el estado de la carga
export function useBloqueos() {
  const { datos, ...resto } = useDatosPeriodicos(obtenerBloqueos, INTERVALO_BLOQUEOS_MS, {
    activo: supabaseConfigurado,
  })
  const { recargar } = resto

  // Tiempo real: cuando alguien crea, renueva o elimina un bloqueo, se recarga
  // sin mostrar "Actualizando…". El primer aviso recarga de inmediato; los que lleguen
  // en los siguientes 5 s se juntan en una sola recarga (cuida la batería y el servidor).
  useEffect(() => {
    if (!supabaseConfigurado) return
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
    const cancelar = suscribirseABloqueos(alAvisar)
    return () => {
      clearTimeout(pendiente)
      cancelar()
    }
  }, [recargar])

  // Hora actual, renovada cada minuto, para quitar los vencidos
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), REVISION_VENCIDOS_MS)
    return () => clearInterval(intervalo)
  }, [])

  const bloqueos = useMemo(() => {
    if (!datos) return null
    return {
      ...datos,
      features: datos.features.filter((bloqueo) => (bloqueo.properties.expiraEn ?? 0) > ahora),
    }
  }, [datos, ahora])

  // Sin Supabase no se pide nada: se avisa una vez en lugar de reintentar
  const estadoCarga = supabaseConfigurado ? resto : { ...resto, estado: 'error', error: MENSAJE_SIN_CONFIGURAR }
  return { ...estadoCarga, bloqueos }
}
