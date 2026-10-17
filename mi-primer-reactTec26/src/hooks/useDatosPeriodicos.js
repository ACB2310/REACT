import { useCallback, useEffect, useRef, useState } from 'react'

// Hook genérico para datos externos que se actualizan solos cada cierto tiempo.
// `obtener({ signal })` debe devolver { datos, actualizadoEn } y estar definida
// fuera del componente (así no cambia en cada render).
// Si una recarga falla, se conservan los últimos datos que sí llegaron.
// Con `activo: false` no se pide nada (por ejemplo, si la capa está apagada).
export function useDatosPeriodicos(obtener, intervaloMs, { activo = true } = {}) {
  const [datos, setDatos] = useState(null)
  const [actualizadoEn, setActualizadoEn] = useState(null)
  // Hora de la última descarga exitosa. Sirve cuando la fuente no trae hora propia
  // (por ejemplo, NHC sin tormentas activas): así se sabe cuándo se revisó.
  const [consultadoEn, setConsultadoEn] = useState(null)
  const [estado, setEstado] = useState('cargando')
  const [error, setError] = useState(null)
  const [sinConexion, setSinConexion] = useState(() => !navigator.onLine)

  // Siempre se usa la última versión de `obtener`
  const obtenerRef = useRef(obtener)
  useEffect(() => {
    obtenerRef.current = obtener
  }, [obtener])

  // Guarda la función de carga actual para que `recargar` pueda llamarla
  const cargarRef = useRef(null)

  // Efecto principal: carga al activarse, repite cada `intervaloMs` y
  // escucha cuando el celular pierde o recupera la conexión.
  useEffect(() => {
    if (!activo) return

    let controlador = null

    async function cargar() {
      // Si había una petición en curso, se cancela para no mezclar respuestas
      controlador?.abort()
      const actual = new AbortController()
      controlador = actual

      try {
        const resultado = await obtenerRef.current({ signal: actual.signal })
        if (actual.signal.aborted) return
        setDatos(resultado.datos)
        setActualizadoEn(resultado.actualizadoEn)
        setConsultadoEn(Date.now())
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
    const intervalo = setInterval(cargar, intervaloMs)
    window.addEventListener('offline', alDesconectar)
    window.addEventListener('online', alConectar)

    // Limpieza al salir de la pantalla o al desactivarse: se detiene todo
    return () => {
      clearInterval(intervalo)
      window.removeEventListener('offline', alDesconectar)
      window.removeEventListener('online', alConectar)
      controlador?.abort()
      cargarRef.current = null
    }
  }, [activo, intervaloMs])

  // Para el botón "Reintentar". Con { silencioso: true } (por ejemplo, un aviso de
  // tiempo real) recarga sin mostrar "Actualizando…".
  const recargar = useCallback((opciones) => {
    if (!cargarRef.current) return
    if (opciones?.silencioso !== true) setEstado('cargando')
    cargarRef.current()
  }, [])

  return { datos, estado, error, actualizadoEn, consultadoEn, sinConexion, recargar }
}
