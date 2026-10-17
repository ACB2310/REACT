import { useState } from 'react'
import { useInstalacionPwa } from '../hooks/useInstalacionPwa.js'
import './BotonInstalarApp.css'

function BotonInstalarApp() {
  const { sePuedeInstalar, instalando, instalada, instalar } = useInstalacionPwa()
  const [mostrarAyuda, setMostrarAyuda] = useState(false)

  if (instalada) return null

  async function alInstalar() {
    if (sePuedeInstalar) {
      await instalar()
      return
    }
    setMostrarAyuda(true)
  }

  return (
    <aside className="aviso-instalacion" aria-label="Instalar aplicación" role="status">
      <div>
        <strong>Alerta México en tu dispositivo</strong>
        <p>
          {mostrarAyuda
            ? 'Abre el menú del navegador y elige “Instalar Alerta México”.'
            : 'Instala la app para abrir el mapa más rápido.'}
        </p>
      </div>
      <button type="button" className="boton-instalar" onClick={alInstalar} disabled={instalando}>
        {instalando ? 'Abriendo instalación…' : 'Instalar app'}
      </button>
    </aside>
  )
}

export default BotonInstalarApp
