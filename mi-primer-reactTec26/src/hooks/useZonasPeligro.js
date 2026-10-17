import { useEffect, useMemo, useState } from 'react'
import { obtenerZonas, suscribirseAZonas } from '../services/zonas.js'
import { supabaseConfigurado, MENSAJE_SIN_CONFIGURAR } from '../services/supabase.js'
import { useDatosPeriodicos } from './useDatosPeriodicos.js'
import { useAvisosTiempoReal } from './useAvisosTiempoReal.js'

// Las zonas llegan por tiempo real; esta recarga es solo de respaldo
export const INTERVALO_ZONAS_MS = 300000
// Cada minuto se quitan las que ya vencieron (importa sobre todo con la copia sin conexión)
export const REVISION_ZONAS_VENCIDAS_MS = 60000

const vigente = (zona, ahora) => zona?.properties?.expiraEn == null || zona.properties.expiraEn > ahora

// Zonas de peligro activas (FeatureCollection de polígonos). Las ve todo el mundo.
export function useZonasPeligro() {
  // guardarComo: copia en el teléfono para usarla sin conexión (etapa 7; solo datos públicos)
  const { datos, ...resto } = useDatosPeriodicos(obtenerZonas, INTERVALO_ZONAS_MS, {
    activo: supabaseConfigurado,
    guardarComo: 'zonas',
  })
  useAvisosTiempoReal(suscribirseAZonas, resto.recargar, supabaseConfigurado)

  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), REVISION_ZONAS_VENCIDAS_MS)
    return () => clearInterval(intervalo)
  }, [])

  // Ids de las zonas vigentes, como texto: si no venció ninguna, la lista es la MISMA
  // y la ruta (que se recalcula cuando cambia la lista) no repite el cálculo
  const claveVigentes = datos ? datos.features.filter((z) => vigente(z, ahora)).map((z) => z.id).join(',') : null
  const zonas = useMemo(() => {
    if (!datos) return null
    const ids = new Set(claveVigentes ? claveVigentes.split(',') : [])
    return { ...datos, features: datos.features.filter((z) => ids.has(String(z.id))) }
  }, [datos, claveVigentes])

  const estadoCarga = supabaseConfigurado ? resto : { ...resto, estado: 'error', error: MENSAJE_SIN_CONFIGURAR }
  return { ...estadoCarga, zonas }
}
