// Convierte los errores de Supabase en mensajes en español para la pantalla.
// Las funciones SQL (supabase/migrations/) lanzan códigos como 'LIMITE_REPORTES';
// aquí se traducen. El detalle técnico se guarda en `cause` y no se muestra.

const MENSAJES = {
  LIMITE_REPORTES: 'Ya enviaste 5 reportes en la última hora. Espera un poco antes de enviar otro.',
  FUERA_DE_MEXICO: 'El punto está fuera de México. Revisa la ubicación.',
  SIN_PERMISO: 'No tienes permiso para hacer esto.',
  NO_EXISTE: 'El bloqueo ya no existe o ya venció.',
  SIN_SESION: 'No se pudo iniciar una sesión para enviar el reporte.',
  // Migración 4: límite de reportes sin confirmar por zona y de renovaciones de ciudadanos
  LIMITE_ZONA: 'Ya hay muchos reportes sin confirmar en esta zona. Si es urgente, avisa a Protección Civil o a un brigadista.',
  RENOVACION_LIMITE: 'Este reporte ya no se puede renovar. Si el bloqueo sigue, repórtalo de nuevo.',
  // Etapa 6 (migración 5): brigadas e incidentes
  BRIGADA_OCUPADA: 'La brigada ya tiene un incidente o no está disponible.',
  INCIDENTE_ASIGNADO: 'Ese incidente ya tiene una brigada asignada.',
  INCIDENTE_CERRADO: 'El incidente ya no existe o ya está atendido o cancelado.',
  TRANSICION_INVALIDA: 'Ese cambio de estado no es posible ahora.',
  SIN_BRIGADA: 'Tu cuenta no pertenece a ninguna brigada. Pide al coordinador que te agregue.',
  NOMBRE_REPETIDO: 'Ya existe una brigada con ese nombre.',
  BRIGADA_NO_EXISTE: 'La brigada ya no existe.',
  NO_ES_BRIGADISTA: 'Esa cuenta no tiene rol de brigadista.',
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

  // Se busca el código COMPLETO: 'NO_EXISTE' no debe coincidir dentro de 'BRIGADA_NO_EXISTE'
  for (const [codigo, mensaje] of Object.entries(MENSAJES)) {
    if (new RegExp(`(^|[^A-Z_])${codigo}([^A-Z_]|$)`).test(texto)) return new Error(mensaje, { cause: error })
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
