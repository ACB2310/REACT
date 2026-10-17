import { useState } from 'react'
import { useSesion } from '../hooks/useSesion.js'
import './Pantallas.css'

const NOMBRES_ROL = {
  ciudadano: 'Ciudadano',
  brigadista: 'Brigadista',
  coordinador: 'Coordinador',
}

// Entrar o crear una cuenta con correo y contraseña.
// No hace falta cuenta para reportar bloqueos: la cuenta sirve para
// brigadistas y coordinadores (su rol se asigna en Supabase).
function IniciarSesion() {
  const { usuario, esAnonimo, rol, cargando, configurado, entrar, crearCuenta, salir } = useSesion()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  // estado: 'listo' | 'trabajando' | 'error' | 'confirmar'
  const [envio, setEnvio] = useState({ estado: 'listo', mensaje: null })

  async function ejecutar(accion) {
    setEnvio({ estado: 'trabajando', mensaje: null })
    try {
      const resultado = await accion()
      if (resultado?.necesitaConfirmar) {
        setEnvio({ estado: 'confirmar', mensaje: 'Te enviamos un correo para confirmar tu cuenta.' })
      } else {
        setEnvio({ estado: 'listo', mensaje: null })
        setContrasena('')
      }
    } catch (error) {
      setEnvio({ estado: 'error', mensaje: error.message })
    }
  }

  function alEntrar(evento) {
    evento.preventDefault()
    ejecutar(() => entrar(correo.trim(), contrasena))
  }

  if (!configurado) {
    return (
      <main className="pantalla-formulario">
        <h1>Entrar</h1>
        <div className="mensaje-estado mensaje-error" role="alert">
          <p>No se puede entrar: falta configurar Supabase.</p>
        </div>
      </main>
    )
  }

  if (cargando) {
    return (
      <main className="pantalla-formulario">
        <p role="status">Cargando…</p>
      </main>
    )
  }

  // Con cuenta: se muestra quién es y su rol
  if (usuario && !esAnonimo) {
    return (
      <main className="pantalla-formulario">
        <h1>Mi cuenta</h1>
        <p>{usuario.email}</p>
        <p>
          Rol: <strong>{NOMBRES_ROL[rol] ?? rol}</strong>
        </p>
        {envio.estado === 'error' && (
          <div className="mensaje-estado mensaje-error" role="alert">
            <p>{envio.mensaje}</p>
          </div>
        )}
        <button type="button" className="boton-secundario" onClick={() => ejecutar(salir)}>
          Salir
        </button>
      </main>
    )
  }

  const trabajando = envio.estado === 'trabajando'
  return (
    <main className="pantalla-formulario">
      <h1>Entrar</h1>
      <p className="texto-ayuda">No necesitas cuenta para reportar bloqueos.</p>
      {esAnonimo && <p className="texto-ayuda">Estás usando la app sin cuenta.</p>}

      <form className="pantalla-formulario-seccion" onSubmit={alEntrar}>
        <label className="campo">
          Correo
          <input
            type="email"
            autoComplete="email"
            required
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
          />
        </label>
        <label className="campo">
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={contrasena}
            onChange={(evento) => setContrasena(evento.target.value)}
          />
        </label>

        {envio.mensaje && (
          <div
            className={`mensaje-estado ${envio.estado === 'error' ? 'mensaje-error' : 'mensaje-info'}`}
            role={envio.estado === 'error' ? 'alert' : 'status'}
          >
            <p>{envio.mensaje}</p>
          </div>
        )}

        <div className="fila-botones">
          <button type="submit" className="boton-principal" disabled={trabajando}>
            {trabajando ? 'Un momento…' : 'Entrar'}
          </button>
          <button
            type="button"
            className="boton-secundario"
            disabled={trabajando || !correo || contrasena.length < 6}
            onClick={() => ejecutar(() => crearCuenta(correo.trim(), contrasena))}
          >
            Crear cuenta
          </button>
        </div>
      </form>
    </main>
  )
}

export default IniciarSesion
