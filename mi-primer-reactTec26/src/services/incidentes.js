import { obtenerCliente } from './supabase.js'
import { aMilisegundos, pedirASupabase } from './consultaSupabase.js'

// Incidentes que atienden las brigadas (tabla incidentes de Supabase, etapa 6).
// Solo brigadistas y coordinadores pueden leerlos; solo el coordinador los crea.
// La vista incidentes_vista entrega los abiertos con longitud, latitud y su brigada.

function aFeature(fila) {
  return {
    type: 'Feature',
    id: fila.id,
    // Siempre [longitud, latitud]
    geometry: { type: 'Point', coordinates: [fila.longitud, fila.latitud] },
    properties: {
      id: fila.id,
      tipo: fila.tipo,
      prioridad: fila.prioridad,
      descripcion: fila.descripcion,
      estado: fila.estado,
      bloqueoId: fila.bloqueo_id,
      brigadaId: fila.brigada_id,
      brigadaNombre: fila.brigada_nombre,
      brigadaEstado: fila.brigada_estado,
      creadoEn: aMilisegundos(fila.creado_en),
      actualizadoEn: aMilisegundos(fila.actualizado_en),
    },
  }
}

// Incidentes abiertos, del más urgente (prioridad 1) al menos urgente, y los más viejos primero
export async function obtenerIncidentes({ signal } = {}) {
  const filas = await pedirASupabase((cliente) =>
    cliente
      .from('incidentes_vista')
      .select('*')
      .order('prioridad')
      .order('creado_en')
      .abortSignal(signal),
  )
  const features = (filas ?? [])
    .filter((fila) => typeof fila.longitud === 'number' && typeof fila.latitud === 'number')
    .map(aFeature)
  const fechas = features.map((f) => f.properties.actualizadoEn).filter((ms) => ms !== null)
  return {
    datos: { type: 'FeatureCollection', features },
    actualizadoEn: fechas.length > 0 ? Math.max(...fechas) : null,
  }
}

// Crea un incidente en `posicion` ([longitud, latitud]). Devuelve su id.
export function crearIncidente({ posicion: [longitud, latitud], tipo, prioridad, descripcion = null, bloqueoId = null }) {
  return pedirASupabase((cliente) =>
    cliente.rpc('crear_incidente', {
      p_longitud: longitud,
      p_latitud: latitud,
      p_tipo: tipo,
      p_prioridad: prioridad,
      p_descripcion: descripcion,
      p_bloqueo_id: bloqueoId,
    }),
  )
}

export async function actualizarIncidente({ id, prioridad, descripcion = null }) {
  await pedirASupabase((cliente) =>
    cliente.rpc('actualizar_incidente', { p_id: id, p_prioridad: prioridad, p_descripcion: descripcion }),
  )
}

export async function cancelarIncidente(id) {
  await pedirASupabase((cliente) => cliente.rpc('cancelar_incidente', { p_id: id }))
}

// Avisa con `alCambiar()` cuando cambia un incidente, una brigada o sus miembros.
// Canal PRIVADO: solo brigadistas y coordinadores lo pueden escuchar y nadie puede
// mandar avisos falsos (migración 5). Devuelve una función para dejar de escuchar.
//
// Varias partes de la app escuchan a la vez (incidentes, brigadas, mi asignación):
// se abre UN solo canal y se cierra cuando ya nadie escucha.
const oyentes = new Set()
let canalCompartido = null

export function suscribirseABrigadas(alCambiar) {
  const cliente = obtenerCliente()
  oyentes.add(alCambiar)
  if (!canalCompartido) {
    canalCompartido = cliente
      .channel('brigadas-cambios', { config: { private: true } })
      .on('broadcast', { event: 'cambio' }, () => {
        for (const oyente of [...oyentes]) oyente()
      })
      .subscribe()
  }
  return () => {
    oyentes.delete(alCambiar)
    if (oyentes.size === 0 && canalCompartido) {
      cliente.removeChannel(canalCompartido)
      canalCompartido = null
    }
  }
}
