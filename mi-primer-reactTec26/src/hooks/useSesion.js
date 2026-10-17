import { useContext } from 'react'
import { ContextoSesion } from './contextoSesion.js'

// Devuelve la sesión actual:
// { usuario, rol, esAnonimo, cargando, configurado,
//   entrar, crearCuenta, salir, asegurarSesion }
// Debe usarse dentro de <ProveedorSesion>.
export function useSesion() {
  const sesion = useContext(ContextoSesion)
  if (!sesion) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>')
  return sesion
}
