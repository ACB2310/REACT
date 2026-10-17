import { useEffect, useState } from 'react'

// ¿El celular tiene conexión? Se actualiza al perderla o recuperarla.
export function useEnLinea() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)

  useEffect(() => {
    const alConectar = () => setEnLinea(true)
    const alDesconectar = () => setEnLinea(false)
    window.addEventListener('online', alConectar)
    window.addEventListener('offline', alDesconectar)
    return () => {
      window.removeEventListener('online', alConectar)
      window.removeEventListener('offline', alDesconectar)
    }
  }, [])

  return enLinea
}
