import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router'
import Mapa from './pages/Mapa.jsx'
import BarraNavegacion from './components/BarraNavegacion.jsx'
import BotonInstalarApp from './components/BotonInstalarApp.jsx'
import { useSesion } from './hooks/useSesion.js'
import './App.css'

// El mapa (la pantalla principal) viene con la app. Las demás se descargan al abrirlas
// por primera vez: así la app abre más rápido con poca señal. Sin conexión también
// funcionan, porque el service worker las guarda (pwa.config.js).
const ReportarBloqueo = lazy(() => import('./pages/ReportarBloqueo.jsx'))
const IniciarSesion = lazy(() => import('./pages/IniciarSesion.jsx'))
const AdministrarRefugios = lazy(() => import('./pages/AdministrarRefugios.jsx'))
const PanelBrigadas = lazy(() => import('./pages/PanelBrigadas.jsx'))
const GestionBrigadas = lazy(() => import('./pages/GestionBrigadas.jsx'))
const MiBrigada = lazy(() => import('./pages/MiBrigada.jsx'))
const ZonasPeligro = lazy(() => import('./pages/ZonasPeligro.jsx'))

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
        <Suspense fallback={<p className="pantalla-mensaje">Cargando…</p>}>
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
              path="/zonas"
              element={
                <SoloCoordinador>
                  <ZonasPeligro />
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
        </Suspense>
      </div>
      <BotonInstalarApp />
      <BarraNavegacion />
    </div>
  )
}

export default App
