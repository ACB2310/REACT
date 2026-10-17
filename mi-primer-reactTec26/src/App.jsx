import { Link, Navigate, Route, Routes } from 'react-router'
import Mapa from './pages/Mapa.jsx'
import ReportarBloqueo from './pages/ReportarBloqueo.jsx'
import IniciarSesion from './pages/IniciarSesion.jsx'
import AdministrarRefugios from './pages/AdministrarRefugios.jsx'
import BarraNavegacion from './components/BarraNavegacion.jsx'
import { useSesion } from './hooks/useSesion.js'
import './App.css'

// La pantalla de refugios es solo para el coordinador. Esto solo esconde la
// pantalla: quien de verdad lo impide es la base de datos (políticas RLS).
function SoloCoordinador({ children }) {
  const { rol, cargando } = useSesion()
  if (cargando) return <p className="pantalla-mensaje">Cargando…</p>
  if (rol !== 'coordinador') {
    return (
      <div className="pantalla-mensaje">
        <p>Esta pantalla es solo para coordinadores.</p>
        <Link to="/">Volver al mapa</Link>
      </div>
    )
  }
  return children
}

function App() {
  return (
    <div className="app">
      <div className="app-contenido">
        <Routes>
          <Route path="/" element={<Mapa />} />
          <Route path="/reportar" element={<ReportarBloqueo />} />
          <Route path="/entrar" element={<IniciarSesion />} />
          <Route
            path="/refugios"
            element={
              <SoloCoordinador>
                <AdministrarRefugios />
              </SoloCoordinador>
            }
          />
          {/* Cualquier otra dirección lleva al mapa */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BarraNavegacion />
    </div>
  )
}

export default App
