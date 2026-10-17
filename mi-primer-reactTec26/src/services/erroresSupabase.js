// Convierte los errores de Supabase en mensajes en español para la pantalla.
// Las funciones SQL (supabase/migrations/) lanzan códigos como 'LIMITE_REPORTES';
// aquí se traducen. El detalle técnico se guarda en `cause` y no se muestra.

const MENSAJES = {
  LIMITE_REPORTES: 'Ya enviaste 5 reportes en la última hora. Espera un poco antes de enviar otro.',
  FUERA_DE_MEXICO: 'El punto está fuera de México. Revisa la ubicación.',
  SIN_PERMISO: 'No tienes permiso para hacer esto.',
  NO_EXISTE: 'El bloqueo ya no existe o ya venció.',
  SIN_SESION: 'No se pudo iniciar una sesión para enviar el reporte.',
}

export const MENSAJE_SIN_CONEXION_SUPABASE = 'No se pudo conectar con Supabase'
export const MENSAJE_TIEMPO_SUPABASE = 'Supabase tardó demasiado en responder'
export const MENSAJE_GENERICO_SUPABASE = 'Supabase respondió con un error'

function textoDe(error) {
  return `${error?.name ?? ''} ${error?.message ?? ''} ${error?.details ?? ''}`
}

export function traducirErrorSupabase(error) {
  const texto = textoDe(error)

  // Una cancelación (por ejemplo, al salir de la pantalla) se deja pasar como
  // AbortError para que los hooks la ignoren, igual que con las otras fuentes.
  if (/AbortError/.test(texto)) {
    return new DOMException('Cancelado', 'AbortError')
  }
  if (/TimeoutError/.test(texto)) {
    return new Error(MENSAJE_TIEMPO_SUPABASE, { cause: error })
  }

  for (const [codigo, mensaje] of Object.entries(MENSAJES)) {
    if (texto.includes(codigo)) return new Error(mensaje, { cause: error })
  }

  // fetch lanza TypeError cuando no hay red ("Failed to fetch", "Load failed"...)
  if (error instanceof TypeError || /TypeError|Failed to fetch|Load failed|NetworkError/.test(texto)) {
    return new Error(MENSAJE_SIN_CONEXION_SUPABASE, { cause: error })
  }
  return new Error(MENSAJE_GENERICO_SUPABASE, { cause: error })
}

// Ayudante para los servicios: si Supabase devolvió error, lo lanza ya traducido
export function revisarRespuesta({ data, error }) {
  if (error) throw traducirErrorSupabase(error)
  return data
}
