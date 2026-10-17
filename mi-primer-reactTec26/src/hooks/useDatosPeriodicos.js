import { useCallback, useEffect, useRef, useState } from 'react'

// Copia sin conexión (etapa 7): la última respuesta buena se guarda en el teléfono y se usa
// al abrir la app sin señal. Solo para datos PÚBLICOS (nunca incidentes ni brigadas).
// Una copia de más de 7 días ya no se usa: podría mostrar algo que ya no es cierto.
export const PREFIJO_COPIA = 'datos:v1:'
export const EDAD_MAXIMA_COPIA_MS = 7 * 86400000

function leerCopia(clave) {
  if (!clave) return null
  try {
    const copia = JSON.parse(localStorage.getItem(PREFIJO_COPIA + clave))
    const edad = Date.now() - copia?.guardadoEn
    if (copia?.datos == null || !Number.isFinite(edad) || edad > EDAD_MAXIMA_COPIA_MS) return null
    return copia
  } catch {
    // Copia rota o almacenamiento bloqueado: como si no hubiera copia
    return null
  }
}

function guardarCopia(clave, copia) {
  if (!clave) return
  try {
    localStorage.setItem(PREFIJO_COPIA + clave, JSON.stringify(copia))
  } catch {
    // Almacenamiento lleno o bloqueado: la app sigue igual, solo no habrá copia sin conexión
  }
}

// Hook genérico para datos externos que se actualizan solos cada cierto tiempo.
// `obtener({ signal })` debe devolver { datos, actualizadoEn } y estar definida
// fuera del componente (así no cambia en cada render).
// Si una recarga falla, se conservan los últimos datos que sí llegaron.
// Con `activo: false` no se pide nada (por ejemplo, si la capa está apagada).
// Con `guardarComo: 'nombre'` se guarda una copia para usarla sin conexión (ver arriba);
// mientras se muestra esa copia, `desdeAlmacen` es true. `prepararCopia(datos)` (opcional)
// quita lo que no debe quedar guardado en el teléfono (por ejemplo, lo que depende de la sesión).
export function useDatosPeriodicos(obtener, intervaloMs, { activo = true, guardarComo = null, prepararCopia = null } = {}) {
  const [copiaInicial] = useState(() => leerCopia(guardarComo))
  const [datos, setDatos] = useState(copiaInicial?.datos ?? null)
  const [actualizadoEn, setActualizadoEn] = useState(copiaInicial?.actualizadoEn ?? null)
  // Hora de la última descarga exitosa. Sirve cuando la fuente no trae hora propia
  // (por ejemplo, NHC sin tormentas activas): así se sabe cuándo se revisó.
  const [consultadoEn, setConsultadoEn] = useState(copiaInicial?.consultadoEn ?? null)
  const [desdeAlmacen, setDesdeAlmacen] = useState(copiaInicial !== null)
  const guardarComoRef = useRef(guardarComo)
  const prepararCopiaRef = useRef(prepararCopia)
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
        const ahora = Date.now()
        setDatos(resultado.datos)
        setActualizadoEn(resultado.actualizadoEn)
        setConsultadoEn(ahora)
        setDesdeAlmacen(false)
        guardarCopia(guardarComoRef.current, {
          datos: prepararCopiaRef.current ? prepararCopiaRef.current(resultado.datos) : resultado.datos,
          actualizadoEn: resultado.actualizadoEn ?? null,
          consultadoEn: ahora,
          guardadoEn: ahora,
        })
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

  return { datos, estado, error, actualizadoEn, consultadoEn, sinConexion, desdeAlmacen, recargar }
}
