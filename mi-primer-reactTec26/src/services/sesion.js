import { obtenerCliente, supabaseConfigurado } from './supabase.js'
import { pedirASupabase } from './consultaSupabase.js'
import { MENSAJE_SIN_CONEXION_SUPABASE } from './erroresSupabase.js'

// Sesión del usuario con Supabase Auth: con cuenta (correo y contraseña)
// o anónima (para reportar sin cuenta).

// Mensajes de Supabase Auth → español
const MENSAJES_SESION = [
  [/Invalid login credentials/i, 'Correo o contraseña incorrectos'],
  [/User already registered/i, 'Ya existe una cuenta con ese correo'],
  [/Password should be at least/i, 'La contraseña debe tener al menos 6 caracteres'],
  [/Email not confirmed/i, 'Confirma tu correo antes de entrar'],
  [/Unable to validate email|invalid format/i, 'El correo no es válido'],
  [/Anonymous sign-ins are disabled/i, 'Los reportes sin cuenta no están activados en Supabase'],
  [/rate limit|too many/i, 'Demasiados intentos. Espera unos minutos.'],
  [/Failed to fetch|Load failed|NetworkError|TypeError/i, MENSAJE_SIN_CONEXION_SUPABASE],
]

export function traducirErrorSesion(error) {
  const texto = `${error?.name ?? ''} ${error?.message ?? ''}`
  const encontrado = MENSAJES_SESION.find(([patron]) => patron.test(texto))
  return new Error(encontrado ? encontrado[1] : 'No se pudo completar la operación', { cause: error })
}

async function llamarAuth(accion) {
  const cliente = obtenerCliente()
  let resultado
  try {
    resultado = await accion(cliente.auth)
  } catch (error) {
    throw traducirErrorSesion(error)
  }
  if (resultado?.error) throw traducirErrorSesion(resultado.error)
  return resultado?.data
}

// Escucha los cambios de sesión (incluida la sesión inicial guardada en el navegador).
// `alCambiar(usuario | null)`. Devuelve una función para dejar de escuchar.
export function escucharSesion(alCambiar) {
  if (!supabaseConfigurado) {
    alCambiar(null)
    return () => {}
  }
  const { data } = obtenerCliente().auth.onAuthStateChange((_evento, sesion) => {
    // Supabase recomienda no llamar a otras funciones suyas dentro de este aviso;
    // por eso se avisa en el siguiente ciclo.
    setTimeout(() => alCambiar(sesion?.user ?? null), 0)
  })
  return () => data.subscription.unsubscribe()
}

export function entrar(correo, contrasena) {
  return llamarAuth((auth) => auth.signInWithPassword({ email: correo, password: contrasena }))
}

// Devuelve { necesitaConfirmar: true } si Supabase pide confirmar el correo
export async function crearCuenta(correo, contrasena) {
  // El enlace del correo de confirmación regresa a donde se abrió la app (localhost,
  // la prueba en AWS, etc.). Esa dirección debe estar en Supabase:
  // Authentication → URL Configuration → Redirect URLs.
  const datos = await llamarAuth((auth) =>
    auth.signUp({
      email: correo,
      password: contrasena,
      options: { emailRedirectTo: window.location.origin },
    }),
  )
  return { necesitaConfirmar: !datos?.session }
}

export function entrarSinCuenta() {
  return llamarAuth((auth) => auth.signInAnonymously())
}

export function salir() {
  return llamarAuth((auth) => auth.signOut())
}

// Rol del usuario actual según la base de datos: 'ciudadano', 'brigadista' o 'coordinador'
export async function obtenerRol() {
  const rol = await pedirASupabase((cliente) => cliente.rpc('rol_actual'))
  return ['ciudadano', 'brigadista', 'coordinador'].includes(rol) ? rol : 'ciudadano'
}
