import { useCallback, useEffect, useRef, useState } from 'react'
import { obtenerSismos } from '../services/usgs.js'

// Cada cuánto se vuelven a pedir los sismos: 5 minutos.
// No es más seguido para cuidar la batería y los datos del celular.
export const INTERVALO_ACTUALIZACION_MS = 300000

// Hook que entrega los sismos de USGS y el estado de la carga.
// Si una recarga falla, se conservan los últimos datos que sí llegaron.
export function useSismos() {
  const [sismos, setSismos] = useState(null)
  const [actualizadoEn, setActualizadoEn] = useState(null)
  const [estado, setEstado] = useState('cargando')
  const [error, setError] = useState(null)
  const [sinConexion, setSinConexion] = useState(() => !navigator.onLine)

  // Guarda la función de carga actual para que `recargar` pueda llamarla
  const cargarRef = useRef(null)

  // Efecto principal: carga al montar, repite cada 5 minutos y
  // escucha cuando el celular pierde o recupera la conexión.
  useEffect(() => {
    let controlador = null

    async function cargar() {
      // Si había una petición en curso, se cancela para no mezclar respuestas
      controlador?.abort()
      const actual = new AbortController()
      controlador = actual

      try {
        const { coleccion, generadoEn } = await obtenerSismos({ signal: actual.signal })
        if (actual.signal.aborted) return
        setSismos(coleccion)
        setActualizadoEn(generadoEn)
        setError(null)
        setEstado('listo')
        // Si la descarga funcionó, hay conexión (por si el evento 'online' no llegó)
        setSinConexion(false)
      } catch (e) {
        // Una cancelación no es un error que haya que mostrar
        if (e.name === 'AbortError' || actual.signal.aborted) return
        setError(e.message)
        setEstado('error')
      }
    }

    function alDesconectar() {
      setSinConexion(true)
    }
    function alConectar() {
      setSinConexion(false)
      cargar()
    }

    cargarRef.current = cargar
    cargar()
    const intervalo = setInterval(cargar, INTERVALO_ACTUALIZACION_MS)
    window.addEventListener('offline', alDesconectar)
    window.addEventListener('online', alConectar)

    // Limpieza al salir de la pantalla: se detiene todo
    return () => {
      clearInterval(intervalo)
      window.removeEventListener('offline', alDesconectar)
      window.removeEventListener('online', alConectar)
      controlador?.abort()
      cargarRef.current = null
    }
  }, [])

  // Para el botón "Reintentar"
  const recargar = useCallback(() => {
    setEstado('cargando')
    cargarRef.current?.()
  }, [])

  return { sismos, estado, error, actualizadoEn, sinConexion, recargar }
}
