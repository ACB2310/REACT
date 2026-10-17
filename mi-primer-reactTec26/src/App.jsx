import { Link, Navigate, Route, Routes } from 'react-router'
import Mapa from './pages/Mapa.jsx'
import ReportarBloqueo from './pages/ReportarBloqueo.jsx'
import IniciarSesion from './pages/IniciarSesion.jsx'
import AdministrarRefugios from './pages/AdministrarRefugios.jsx'
import PanelBrigadas from './pages/PanelBrigadas.jsx'
import GestionBrigadas from './pages/GestionBrigadas.jsx'
import MiBrigada from './pages/MiBrigada.jsx'
import BarraNavegacion from './components/BarraNavegacion.jsx'
import { useSesion } from './hooks/useSesion.js'
import './App.css'

const NOMBRES_ROL = { coordinador: 'coordinadores', brigadista: 'brigadistas' }

// Pantallas solo para ciertos roles. Esto solo esconde la pantalla: quien de verdad
// lo impide es la base de datos (políticas RLS y funciones que revisan el rol).
function SoloRol({ roles, children }) {
  const { rol, cargando } = useSesion()
  if (cargando) return <p className="pantalla-mensaje">Cargando…</p>
  if (!roles.includes(rol)) {
    return (
      <div className="pantalla-mensaje">
        <p>Esta pantalla es solo para {roles.map((r) => NOMBRES_ROL[r] ?? r).join(' y ')}.</p>
        <Link to="/">Volver al mapa</Link>
      </div>
    )
  }
  return children
}

function SoloCoordinador({ children }) {
  return <SoloRol roles={['coordinador']}>{children}</SoloRol>
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
          <Route
            path="/brigadas"
            element={
              <SoloCoordinador>
                <PanelBrigadas />
              </SoloCoordinador>
            }
          />
          <Route
            path="/brigadas/equipos"
            element={
              <SoloCoordinador>
                <GestionBrigadas />
              </SoloCoordinador>
            }
          />
          <Route
            path="/mi-brigada"
            element={
              <SoloRol roles={['brigadista']}>
                <MiBrigada />
              </SoloRol>
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
