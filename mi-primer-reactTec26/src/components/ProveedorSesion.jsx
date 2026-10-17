import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ContextoSesion } from '../hooks/contextoSesion.js'
import { supabaseConfigurado } from '../services/supabase.js'
import * as servicioSesion from '../services/sesion.js'

// Guarda quién está usando la app (con cuenta, anónimo o nadie) y su rol,
// y lo comparte con todas las pantallas. Abrir la app NO crea sesión:
// la sesión anónima se crea solo al enviar el primer reporte.
function ProveedorSesion({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [rol, setRol] = useState('ciudadano')
  const [cargando, setCargando] = useState(supabaseConfigurado)

  // El usuario más reciente, para que asegurarSesion no lea un valor viejo
  const usuarioRef = useRef(null)
  // Si ya se está creando una sesión anónima, se espera esa misma
  const creandoSesionRef = useRef(null)

  useEffect(() => {
    // Cada cambio de sesión tiene un número; si llega una respuesta de rol
    // vieja (de una sesión anterior), se ignora.
    let ultimoCambio = 0
    let activo = true

    const dejarDeEscuchar = servicioSesion.escucharSesion(async (nuevoUsuario) => {
      const cambio = ++ultimoCambio
      usuarioRef.current = nuevoUsuario
      setUsuario(nuevoUsuario)

      let nuevoRol = 'ciudadano'
      // Los anónimos siempre son ciudadanos; solo las cuentas tienen otro rol
      if (nuevoUsuario && !nuevoUsuario.is_anonymous) {
        try {
          nuevoRol = await servicioSesion.obtenerRol()
        } catch {
          // Si no se pudo saber el rol, se usa el de menos permisos
          nuevoRol = 'ciudadano'
        }
      }
      if (!activo || cambio !== ultimoCambio) return
      setRol(nuevoRol)
      setCargando(false)
    })

    return () => {
      activo = false
      dejarDeEscuchar()
    }
  }, [])

  // Se usa antes de enviar un reporte: si no hay sesión, crea una anónima
  const asegurarSesion = useCallback(async () => {
    if (usuarioRef.current) return usuarioRef.current
    if (!creandoSesionRef.current) {
      creandoSesionRef.current = servicioSesion
        .entrarSinCuenta()
        .then((datos) => {
          usuarioRef.current = datos?.user ?? datos?.session?.user ?? null
          return usuarioRef.current
        })
        .finally(() => {
          creandoSesionRef.current = null
        })
    }
    return creandoSesionRef.current
  }, [])

  const valor = useMemo(
    () => ({
      usuario,
      rol,
      esAnonimo: Boolean(usuario?.is_anonymous),
      cargando,
      configurado: supabaseConfigurado,
      entrar: servicioSesion.entrar,
      crearCuenta: servicioSesion.crearCuenta,
      salir: servicioSesion.salir,
      asegurarSesion,
    }),
    [usuario, rol, cargando, asegurarSesion],
  )

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}

export default ProveedorSesion
