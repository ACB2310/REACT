import { obtenerCliente } from './supabase.js'
import { aMilisegundos, pedirASupabase } from './consultaSupabase.js'

// Zonas de peligro que marca el coordinador (tabla zonas_peligro, etapa 4).
// Todos las pueden ver; solo el coordinador las crea o desactiva.

// El GeoJSON llega como texto desde la vista; si viene roto, la zona se descarta
function leerGeojson(texto) {
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

function aFeature(fila) {
  const geometria = leerGeojson(fila.geojson)
  return {
    type: 'Feature',
    id: fila.id,
    // GeoJSON Polygon, coordenadas [longitud, latitud]
    geometry: geometria,
    properties: {
      id: fila.id,
      origen: fila.origen,
      severidad: fila.severidad,
      descripcion: fila.descripcion,
      expiraEn: aMilisegundos(fila.expira_en),
      creadoEn: aMilisegundos(fila.creado_en),
    },
  }
}

// Zonas activas y no vencidas, como FeatureCollection de polígonos
export async function obtenerZonas({ signal } = {}) {
  const filas = await pedirASupabase((cliente) =>
    cliente.from('zonas_peligro_vista').select('*').order('creado_en').abortSignal(signal),
  )
  const features = (filas ?? []).map(aFeature).filter((f) => f.geometry?.type === 'Polygon')
  const fechas = features.map((f) => f.properties.creadoEn).filter((ms) => ms !== null)
  return {
    datos: { type: 'FeatureCollection', features },
    actualizadoEn: fechas.length > 0 ? Math.max(...fechas) : null,
  }
}

// anillo: [[longitud, latitud], …] cerrado (el primer punto se repite al final).
// severidad: 1 = la ruta la evita; 2 = precaución. expiraEn: ms o null.
export function crearZona({ anillo, severidad = 1, descripcion = null, expiraEn = null }) {
  return pedirASupabase((cliente) =>
    cliente.rpc('crear_zona_peligro', {
      p_geojson: JSON.stringify({ type: 'Polygon', coordinates: [anillo] }),
      p_severidad: severidad,
      p_descripcion: descripcion,
      p_expira_en: expiraEn === null ? null : new Date(expiraEn).toISOString(),
    }),
  )
}

export async function desactivarZona(id) {
  await pedirASupabase((cliente) => cliente.rpc('desactivar_zona_peligro', { p_id: id }))
}

// Avisa con `alCambiar()` cuando se crea, desactiva o vence una zona (canal privado
// zonas-cambios: todos escuchan, solo el servidor envía). Devuelve cómo dejar de escuchar.
export function suscribirseAZonas(alCambiar) {
  const cliente = obtenerCliente()
  const canal = cliente
    .channel('zonas-cambios', { config: { private: true } })
    .on('broadcast', { event: 'cambio' }, () => alCambiar())
    .subscribe()
  return () => {
    cliente.removeChannel(canal)
  }
}
