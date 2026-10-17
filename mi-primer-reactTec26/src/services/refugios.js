import { aMilisegundos, pedirASupabase } from './consultaSupabase.js'

// Refugios de la lista oficial (tabla refugios de Supabase).
// La vista refugios_vista entrega longitud y latitud como números.

function aRefugio(fila) {
  const tieneUbicacion = typeof fila.longitud === 'number' && typeof fila.latitud === 'number'
  return {
    id: fila.id,
    claveOficial: fila.clave_oficial,
    nombre: fila.nombre,
    direccion: fila.direccion,
    municipio: fila.municipio,
    entidad: fila.entidad,
    capacidad: fila.capacidad,
    ocupacion: fila.ocupacion,
    estado: fila.estado,
    fuente: fila.fuente,
    actualizadoEn: aMilisegundos(fila.actualizado_en),
    // [longitud, latitud], o null si el coordinador todavía no lo ubica
    posicion: tieneUbicacion ? [fila.longitud, fila.latitud] : null,
  }
}

// Descarga los refugios. Devuelve:
// - datos: FeatureCollection con los que ya tienen ubicación (para el mapa)
// - refugios: la lista completa (para la pantalla del coordinador)
// - actualizadoEn: la actualización más reciente, en ms
export async function obtenerRefugios({ signal } = {}) {
  const filas = await pedirASupabase((cliente) =>
    cliente.from('refugios_vista').select('*').order('nombre').abortSignal(signal),
  )
  const refugios = (filas ?? []).map(aRefugio)
  const features = refugios
    .filter((refugio) => refugio.posicion)
    .map(({ posicion, ...propiedades }) => ({
      type: 'Feature',
      id: propiedades.id,
      geometry: { type: 'Point', coordinates: posicion },
      properties: propiedades,
    }))
  const fechas = refugios.map((refugio) => refugio.actualizadoEn).filter((ms) => ms !== null)
  return {
    datos: { type: 'FeatureCollection', features },
    refugios,
    actualizadoEn: fechas.length > 0 ? Math.max(...fechas) : null,
  }
}

// El coordinador ubica un refugio y/o cambia su estado y ocupación.
// `posicion` va en [longitud, latitud]; si es null, la ubicación no cambia.
export async function actualizarRefugio({ id, posicion = null, estado = null, ocupacion = null }) {
  const [longitud, latitud] = posicion ?? [null, null]
  await pedirASupabase((cliente) =>
    cliente.rpc('actualizar_refugio', {
      p_id: id,
      p_longitud: longitud,
      p_latitud: latitud,
      p_estado: estado,
      p_ocupacion: ocupacion,
    }),
  )
}
