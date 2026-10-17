import { aMilisegundos, pedirASupabase } from './consultaSupabase.js'

// Brigadas, sus bases y sus miembros (etapa 6). Todas las escrituras son RPC que
// revisan el rol en el servidor; aquí solo se arman los datos.

function aFeature(fila) {
  return {
    type: 'Feature',
    id: fila.id,
    // La base de la brigada, siempre [longitud, latitud]
    geometry: { type: 'Point', coordinates: [fila.longitud, fila.latitud] },
    properties: {
      id: fila.id,
      nombre: fila.nombre,
      vehiculo: fila.vehiculo,
      estado: fila.estado,
      incidenteId: fila.incidente_id,
      miembros: fila.miembros ?? 0,
      esMia: Boolean(fila.es_mia),
      actualizadoEn: aMilisegundos(fila.actualizado_en),
    },
  }
}

// Todas las brigadas con su base (FeatureCollection), ordenadas por nombre
export async function obtenerBrigadas({ signal } = {}) {
  const filas = await pedirASupabase((cliente) =>
    cliente.from('brigadas_vista').select('*').order('nombre').abortSignal(signal),
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

// Para el brigadista: su brigada y, si tiene, su incidente activo.
// Devuelve null si la cuenta no pertenece a ninguna brigada.
export async function obtenerMiAsignacion({ signal } = {}) {
  const filas = await pedirASupabase((cliente) => cliente.rpc('mi_asignacion').abortSignal(signal))
  const fila = filas?.[0]
  if (!fila) return { datos: null, actualizadoEn: null }
  const datos = {
    brigada: {
      id: fila.brigada_id,
      nombre: fila.brigada_nombre,
      estado: fila.brigada_estado,
      base: [fila.base_longitud, fila.base_latitud],
    },
    incidente:
      fila.incidente_id === null || fila.incidente_id === undefined
        ? null
        : {
            id: fila.incidente_id,
            tipo: fila.tipo,
            prioridad: fila.prioridad,
            descripcion: fila.descripcion,
            estado: fila.incidente_estado,
            posicion: [fila.incidente_longitud, fila.incidente_latitud],
            asignadoEn: aMilisegundos(fila.asignado_en),
          },
  }
  return { datos, actualizadoEn: datos.incidente?.asignadoEn ?? null }
}

// Cuentas con rol brigadista (solo coordinador): [{ id, correo, nombre, brigadaId }]
export async function obtenerBrigadistas() {
  const filas = await pedirASupabase((cliente) => cliente.rpc('brigadistas'))
  return (filas ?? []).map((fila) => ({
    id: fila.id,
    correo: fila.correo,
    nombre: fila.nombre,
    brigadaId: fila.brigada_id,
  }))
}

export async function asignarBrigada({ incidenteId, brigadaId }) {
  await pedirASupabase((cliente) =>
    cliente.rpc('asignar_brigada', { p_incidente_id: incidenteId, p_brigada_id: brigadaId }),
  )
}

export async function liberarBrigada(brigadaId) {
  await pedirASupabase((cliente) => cliente.rpc('liberar_brigada', { p_brigada_id: brigadaId }))
}

// El brigadista avanza su asignación: 'en_camino', 'en_sitio' o 'terminado'
export async function avanzarAsignacion(estado) {
  await pedirASupabase((cliente) => cliente.rpc('avanzar_asignacion', { p_estado: estado }))
}

// Crea (id nulo) o edita una brigada. `base` va en [longitud, latitud]. Devuelve el id.
export function guardarBrigada({ id = null, nombre, vehiculo = null, base: [longitud, latitud] }) {
  return pedirASupabase((cliente) =>
    cliente.rpc('guardar_brigada', {
      p_id: id,
      p_nombre: nombre,
      p_vehiculo: vehiculo,
      p_longitud: longitud,
      p_latitud: latitud,
    }),
  )
}

export async function cambiarServicioBrigada({ id, enServicio }) {
  await pedirASupabase((cliente) =>
    cliente.rpc('cambiar_servicio_brigada', { p_id: id, p_en_servicio: enServicio }),
  )
}

// Mete a un brigadista en una brigada (o lo saca con brigadaId null)
export async function asignarMiembro({ usuarioId, brigadaId }) {
  await pedirASupabase((cliente) =>
    cliente.rpc('asignar_miembro', { p_usuario_id: usuarioId, p_brigada_id: brigadaId }),
  )
}
