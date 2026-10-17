import { useCallback, useEffect, useState } from 'react'

export function useInstalacionPwa() {
  const [eventoInstalacion, setEventoInstalacion] = useState(null)
  const [instalando, setInstalando] = useState(false)
  const [instalada, setInstalada] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true,
  )

  useEffect(() => {
    function alPedirInstalacion(evento) {
      evento.preventDefault()
      setEventoInstalacion(evento)
    }

    function alInstalar() {
      setEventoInstalacion(null)
      setInstalando(false)
      setInstalada(true)
    }

    window.addEventListener('beforeinstallprompt', alPedirInstalacion)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPedirInstalacion)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  const instalar = useCallback(async () => {
    if (!eventoInstalacion) return

    setInstalando(true)
    eventoInstalacion.prompt()
    try {
      const eleccion = await eventoInstalacion.userChoice
      if (eleccion.outcome === 'accepted') setInstalada(true)
    } finally {
      setEventoInstalacion(null)
      setInstalando(false)
    }
  }, [eventoInstalacion])

  return { sePuedeInstalar: eventoInstalacion !== null, instalando, instalada, instalar }
}
