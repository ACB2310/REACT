import { useState } from 'react'
import { useInstalacionPwa } from '../hooks/useInstalacionPwa.js'
import './BotonInstalarApp.css'

// Si la persona tocó "Ahora no", no se le vuelve a mostrar el aviso en este teléfono
const CLAVE_AVISO_CERRADO = 'aviso-instalar-cerrado'

function leerAvisoCerrado() {
  try {
    return localStorage.getItem(CLAVE_AVISO_CERRADO) === 'si'
  } catch {
    return false
  }
}

// Aviso para instalar la app en el celular (en computadora no se muestra: ver el CSS)
function BotonInstalarApp() {
  const { sePuedeInstalar, instalando, instalada, instalar } = useInstalacionPwa()
  const [mostrarAyuda, setMostrarAyuda] = useState(false)
  const [cerrado, setCerrado] = useState(leerAvisoCerrado)

  if (instalada || cerrado) return null

  async function alInstalar() {
    if (sePuedeInstalar) {
      await instalar()
      return
    }
    setMostrarAyuda(true)
  }

  function alCerrar() {
    setCerrado(true)
    try {
      localStorage.setItem(CLAVE_AVISO_CERRADO, 'si')
    } catch {
      // Sin almacenamiento el aviso se cierra igual; volverá a salir la próxima vez
    }
  }

  return (
    <aside className="aviso-instalacion" aria-label="Instalar aplicación" role="status">
      <div>
        <strong>Instala Alerta México</strong>
        <p>
          {mostrarAyuda
            ? 'Abre el menú del navegador y elige “Instalar Alerta México”.'
            : 'Abre más rápido y sirve sin señal.'}
        </p>
      </div>
      <div className="aviso-instalacion-botones">
        <button type="button" className="boton-instalar" onClick={alInstalar} disabled={instalando}>
          {instalando ? 'Abriendo instalación…' : 'Instalar app'}
        </button>
        <button type="button" className="boton-ahora-no" onClick={alCerrar} aria-label="Ahora no" title="Ahora no">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </aside>
  )
}

export default BotonInstalarApp
