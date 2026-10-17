import { obtenerCliente } from './supabase.js'
import { aMilisegundos, pedirASupabase } from './consultaSupabase.js'

// Bloqueos reportados por ciudadanos y brigadistas (tabla bloqueos de Supabase).
// La vista bloqueos_vista ya quita los vencidos y entrega longitud y latitud.

function aFeature(fila) {
  const creadoEn = aMilisegundos(fila.creado_en)
  const renovadoEn = aMilisegundos(fila.renovado_en)
  return {
    type: 'Feature',
    id: fila.id,
    // Siempre [longitud, latitud]
    geometry: { type: 'Point', coordinates: [fila.longitud, fila.latitud] },
    properties: {
      id: fila.id,
      tipo: fila.tipo,
      descripcion: fila.descripcion,
      esAnonimo: fila.es_anonimo,
      confirmado: fila.confirmado,
      esMio: fila.es_mio,
      expiraEn: aMilisegundos(fila.expira_en),
      creadoEn,
      // La última vez que alguien lo reportó o lo renovó
      ultimaActividad: renovadoEn ?? creadoEn,
    },
  }
}

// Descarga los bloqueos vigentes como FeatureCollection
export async function obtenerBloqueos({ signal } = {}) {
  const filas = await pedirASupabase((cliente) =>
    cliente.from('bloqueos_vista').select('*').order('creado_en').abortSignal(signal),
  )
  const features = (filas ?? [])
    .filter((fila) => typeof fila.longitud === 'number' && typeof fila.latitud === 'number')
    .map(aFeature)
  const fechas = features.map((f) => f.properties.ultimaActividad).filter((ms) => ms !== null)
  return {
    datos: { type: 'FeatureCollection', features },
    actualizadoEn: fechas.length > 0 ? Math.max(...fechas) : null,
  }
}

// Guarda un bloqueo nuevo. `posicion` va en [longitud, latitud]. Devuelve el id.
export function reportarBloqueo({ posicion: [longitud, latitud], tipo, descripcion = null }) {
  return pedirASupabase((cliente) =>
    cliente.rpc('reportar_bloqueo', {
      p_longitud: longitud,
      p_latitud: latitud,
      p_tipo: tipo,
      p_descripcion: descripcion,
    }),
  )
}

// 24 horas más a partir de ahora. Devuelve el nuevo vencimiento en ms.
export async function renovarBloqueo(id) {
  const vencimiento = await pedirASupabase((cliente) => cliente.rpc('renovar_bloqueo', { p_id: id }))
  return aMilisegundos(vencimiento)
}

export async function eliminarBloqueo(id) {
  await pedirASupabase((cliente) => cliente.rpc('eliminar_bloqueo', { p_id: id }))
}

// Solo un coordinador puede confirmar un bloqueo (el servidor lo revisa)
export async function confirmarBloqueo(id) {
  await pedirASupabase((cliente) => cliente.rpc('confirmar_bloqueo', { p_id: id }))
}

// Avisa con `alCambiar()` cada vez que alguien crea, renueva, confirma o elimina un bloqueo.
// Devuelve una función para dejar de escuchar.
// El servidor solo manda "cambió el bloqueo N" por el canal PRIVADO bloqueos-cambios
// (migración 4): nadie recibe datos de quién reportó y nadie puede mandar avisos falsos.
// La app vuelve a pedir la vista.
export function suscribirseABloqueos(alCambiar) {
  const cliente = obtenerCliente()
  const canal = cliente
    .channel('bloqueos-cambios', { config: { private: true } })
    .on('broadcast', { event: 'cambio' }, () => alCambiar())
    .subscribe()
  return () => {
    cliente.removeChannel(canal)
  }
}
