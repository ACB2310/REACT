import { NavLink } from 'react-router'
import { useSesion } from '../hooks/useSesion.js'
import './BarraNavegacion.css'

// Barra fija abajo, pensada para el pulgar en el celular.
// "Refugios" solo aparece para el coordinador.
function BarraNavegacion() {
  const { usuario, esAnonimo, rol } = useSesion()
  const tieneCuenta = Boolean(usuario) && !esAnonimo

  const opciones = [
    { a: '/', texto: 'Mapa' },
    { a: '/reportar', texto: 'Reportar' },
    ...(rol === 'coordinador' ? [{ a: '/refugios', texto: 'Refugios' }] : []),
    { a: '/entrar', texto: tieneCuenta ? 'Mi cuenta' : 'Entrar' },
  ]

  return (
    <nav className="barra-navegacion" aria-label="Pantallas">
      {opciones.map(({ a, texto }) => (
        <NavLink key={a} to={a} end className="barra-navegacion-enlace">
          {texto}
        </NavLink>
      ))}
    </nav>
  )
}

export default BarraNavegacion
