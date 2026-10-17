import { useState } from 'react'
import { Link } from 'react-router'
import { useSesion } from '../hooks/useSesion.js'
import './Pantallas.css'

const NOMBRES_ROL = {
  ciudadano: 'Ciudadano',
  brigadista: 'Brigadista',
  coordinador: 'Coordinador',
}

// Qué puede hacer cada rol y a qué pantallas le conviene ir
const DETALLE_ROL = {
  ciudadano: {
    texto:
      'Puedes ver el mapa, pedir rutas y reportar bloqueos. Si eres brigadista o coordinador, pide a quien administra la plataforma que te asigne tu rol.',
    accesos: [
      { a: '/', texto: 'Ir al mapa' },
      { a: '/reportar', texto: 'Reportar un bloqueo' },
    ],
  },
  brigadista: {
    texto: 'Ves los incidentes en el mapa y avanzas la asignación de tu brigada.',
    accesos: [
      { a: '/mi-brigada', texto: 'Mi brigada' },
      { a: '/', texto: 'Ir al mapa' },
    ],
  },
  coordinador: {
    texto: 'Creas incidentes, asignas brigadas, ubicas refugios, marcas zonas de peligro y confirmas bloqueos.',
    accesos: [
      { a: '/brigadas', texto: 'Panel de brigadas' },
      { a: '/refugios', texto: 'Refugios' },
      { a: '/zonas', texto: 'Zonas de peligro' },
    ],
  },
}

const LARGO_MINIMO_CONTRASENA = 6

// Entrar o crear una cuenta con correo y contraseña.
// No hace falta cuenta para reportar bloqueos: la cuenta sirve para
// brigadistas y coordinadores (su rol se asigna en Supabase).
function IniciarSesion() {
  const { usuario, esAnonimo, rol, cargando, configurado, entrar, crearCuenta, salir } = useSesion()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [verContrasena, setVerContrasena] = useState(false)
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

  // "Crear cuenta" no es el botón del formulario, así que aquí se revisan los campos
  // y se dice qué falta en lugar de dejar el botón apagado sin explicación
  function alCrearCuenta() {
    if (!correo.trim()) {
      setEnvio({ estado: 'error', mensaje: 'Escribe tu correo para crear la cuenta.' })
      return
    }
    if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
      setEnvio({
        estado: 'error',
        mensaje: `La contraseña necesita al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`,
      })
      return
    }
    ejecutar(() => crearCuenta(correo.trim(), contrasena))
  }

  if (!configurado) {
    return (
      <main className="pantalla-formulario pantalla-angosta">
        <h1>Entrar</h1>
        <div className="mensaje-estado mensaje-error" role="alert">
          <p>No se puede entrar: falta configurar Supabase.</p>
        </div>
      </main>
    )
  }

  if (cargando) {
    return (
      <main className="pantalla-formulario pantalla-angosta">
        <p role="status">Cargando…</p>
      </main>
    )
  }

  // Con cuenta: quién es, qué puede hacer y a dónde ir
  if (usuario && !esAnonimo) {
    const detalle = DETALLE_ROL[rol]
    return (
      <main className="pantalla-formulario pantalla-angosta">
        <h1>Mi cuenta</h1>
        <section className="tarjeta-cuenta" aria-label="Datos de la cuenta">
          <p className="tarjeta-cuenta-correo">{usuario.email}</p>
          <p>
            Rol: <strong>{NOMBRES_ROL[rol] ?? rol}</strong>
          </p>
          {detalle && <p className="texto-ayuda">{detalle.texto}</p>}
        </section>

        {detalle && (
          <nav className="accesos-cuenta" aria-label="Accesos de tu rol">
            {detalle.accesos.map(({ a, texto }) => (
              <Link key={a} to={a} className="boton-principal">
                {texto}
              </Link>
            ))}
          </nav>
        )}

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
    <main className="pantalla-formulario pantalla-angosta">
      <h1>Entrar</h1>
      <div className="aviso-cuenta">
        <p className="texto-ayuda">No necesitas cuenta para reportar bloqueos.</p>
        <p className="texto-ayuda">
          La cuenta es para brigadistas y coordinadores. Después de crearla, quien administra la plataforma te
          asigna tu rol.
        </p>
      </div>
      {esAnonimo && <p className="texto-ayuda">Estás usando la app sin cuenta.</p>}

      <form className="pantalla-formulario-seccion" onSubmit={alEntrar}>
        <label className="campo">
          Correo
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
          />
        </label>

        {/* El botón de mostrar va fuera de la etiqueta para que no cambie su nombre */}
        <div className="campo-contrasena">
          <label className="campo">
            Contraseña
            <input
              type={verContrasena ? 'text' : 'password'}
              autoComplete="current-password"
              required
              minLength={LARGO_MINIMO_CONTRASENA}
              aria-describedby="pista-contrasena"
              value={contrasena}
              onChange={(evento) => setContrasena(evento.target.value)}
            />
          </label>
          <button
            type="button"
            className="boton-ver-contrasena"
            aria-pressed={verContrasena}
            onClick={() => setVerContrasena((visible) => !visible)}
          >
            {verContrasena ? 'Ocultar' : 'Mostrar'}
          </button>
          <p id="pista-contrasena" className="pista-campo">
            Mínimo {LARGO_MINIMO_CONTRASENA} caracteres.
          </p>
        </div>

        {envio.mensaje && (
          <div
            className={`mensaje-estado ${envio.estado === 'error' ? 'mensaje-error' : 'mensaje-info'}`}
            role={envio.estado === 'error' ? 'alert' : 'status'}
          >
            <p>{envio.mensaje}</p>
          </div>
        )}

        <button type="submit" className="boton-principal" disabled={trabajando}>
          {trabajando ? 'Un momento…' : 'Entrar'}
        </button>

        {/* Crear cuenta como acción secundaria, separada y explicada */}
        <div className="separador-cuenta">
          <p className="texto-ayuda">¿Primera vez? Usa el mismo correo y contraseña para crear tu cuenta.</p>
          <button type="button" className="boton-secundario" disabled={trabajando} onClick={alCrearCuenta}>
            Crear cuenta
          </button>
        </div>
      </form>
    </main>
  )
}

export default IniciarSesion
