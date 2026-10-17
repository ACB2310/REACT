// DATOS DE EJEMPLO SOLO PARA PRUEBAS – no usar en producción
// Imitan los renglones de incidentes_vista, brigadas_vista y mi_asignacion() de Supabase.

export const filasIncidentesEjemplo = [
  {
    id: 1,
    tipo: 'rescate',
    prioridad: 1,
    descripcion: 'Persona atrapada (ejemplo)',
    estado: 'pendiente',
    bloqueo_id: null,
    creado_en: '2026-10-17T15:00:00+00:00',
    actualizado_en: '2026-10-17T15:00:00+00:00',
    brigada_id: null,
    brigada_nombre: null,
    brigada_estado: null,
    longitud: -103.36,
    latitud: 20.68,
  },
  {
    id: 2,
    tipo: 'derrumbe',
    prioridad: 3,
    descripcion: null,
    estado: 'asignado',
    bloqueo_id: 10,
    creado_en: '2026-10-17T14:00:00+00:00',
    actualizado_en: '2026-10-17T15:30:00+00:00',
    brigada_id: 7,
    brigada_nombre: 'Brigada Ejemplo Norte',
    brigada_estado: 'asignada',
    longitud: -103.4,
    latitud: 20.7,
  },
]

export const filasBrigadasEjemplo = [
  {
    id: 7,
    nombre: 'Brigada Ejemplo Norte',
    vehiculo: 'Pickup',
    estado: 'asignada',
    incidente_id: 2,
    actualizado_en: '2026-10-17T15:30:00+00:00',
    miembros: 3,
    es_mia: true,
    longitud: -103.41,
    latitud: 20.72,
  },
  {
    id: 8,
    nombre: 'Brigada Ejemplo Sur',
    vehiculo: null,
    estado: 'disponible',
    incidente_id: null,
    actualizado_en: '2026-10-17T12:00:00+00:00',
    miembros: 0,
    es_mia: false,
    longitud: -103.35,
    latitud: 20.6,
  },
]

export const filaMiAsignacionEjemplo = {
  brigada_id: 7,
  brigada_nombre: 'Brigada Ejemplo Norte',
  brigada_estado: 'asignada',
  base_longitud: -103.41,
  base_latitud: 20.72,
  incidente_id: 2,
  tipo: 'derrumbe',
  prioridad: 3,
  descripcion: null,
  incidente_estado: 'asignado',
  incidente_longitud: -103.4,
  incidente_latitud: 20.7,
  asignado_en: '2026-10-17T15:30:00+00:00',
}
