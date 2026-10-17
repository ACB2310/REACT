import { NavLink } from 'react-router'
import { useSesion } from '../hooks/useSesion.js'
import './BarraNavegacion.css'

// Barra fija abajo, pensada para el pulgar en el celular.
// "Brigadas" y "Refugios" solo aparecen para el coordinador; "Mi brigada", para el brigadista.
function BarraNavegacion() {
  const { usuario, esAnonimo, rol } = useSesion()
  const tieneCuenta = Boolean(usuario) && !esAnonimo

  const opciones = [
    { a: '/', texto: 'Mapa' },
    { a: '/reportar', texto: 'Reportar' },
    ...(rol === 'coordinador'
      ? [
          { a: '/brigadas', texto: 'Brigadas', exacto: false },
          { a: '/refugios', texto: 'Refugios' },
        ]
      : []),
    ...(rol === 'brigadista' ? [{ a: '/mi-brigada', texto: 'Mi brigada' }] : []),
    { a: '/entrar', texto: tieneCuenta ? 'Mi cuenta' : 'Entrar' },
  ]

  return (
    <nav className="barra-navegacion" aria-label="Pantallas">
      {/* exacto: false deja marcada "Brigadas" también en /brigadas/equipos */}
      {opciones.map(({ a, texto, exacto = true }) => (
        <NavLink key={a} to={a} end={exacto} className="barra-navegacion-enlace">
          {texto}
        </NavLink>
      ))}
    </nav>
  )
}

export default BarraNavegacion
