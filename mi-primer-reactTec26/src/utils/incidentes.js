// Textos y colores de incidentes y brigadas (etapa 6).
// Prioridad 1 = la más urgente; 5 = la menos urgente (como en el triaje).

export const PRIORIDADES = {
  1: { etiqueta: 'Crítica', color: '#b91c1c' },
  2: { etiqueta: 'Alta', color: '#ea580c' },
  3: { etiqueta: 'Media', color: '#ca8a04' },
  4: { etiqueta: 'Baja', color: '#2563eb' },
  5: { etiqueta: 'Mínima', color: '#6b7280' },
}

export const TIPOS_INCIDENTE = {
  rescate: 'Rescate',
  atencion_medica: 'Atención médica',
  incendio: 'Incendio',
  derrumbe: 'Derrumbe',
  inundacion: 'Inundación',
  bloqueo: 'Bloqueo de vía',
  otro: 'Otro',
}

export const ESTADOS_INCIDENTE = {
  pendiente: 'Sin brigada',
  asignado: 'Brigada asignada',
  en_atencion: 'En atención',
  atendido: 'Atendido',
  cancelado: 'Cancelado',
}

export const ESTADOS_BRIGADA = {
  disponible: { etiqueta: 'Disponible', color: '#16a34a' },
  asignada: { etiqueta: 'Asignada', color: '#ca8a04' },
  en_camino: { etiqueta: 'En camino', color: '#ea580c' },
  en_sitio: { etiqueta: 'En el lugar', color: '#b91c1c' },
  fuera_de_servicio: { etiqueta: 'Fuera de servicio', color: '#6b7280' },
}

export const LIMITE_DESCRIPCION_INCIDENTE = 500

// "1 · Crítica"
export function etiquetaPrioridad(prioridad) {
  const datos = PRIORIDADES[prioridad]
  return datos ? `${prioridad} · ${datos.etiqueta}` : 'Prioridad desconocida'
}

export function etiquetaTipoIncidente(tipo) {
  return TIPOS_INCIDENTE[tipo] ?? 'Otro'
}

export function etiquetaEstadoBrigada(estado) {
  return ESTADOS_BRIGADA[estado]?.etiqueta ?? 'Estado desconocido'
}

// Expresión de MapLibre: color del incidente según su prioridad
export function expresionColorPrioridad() {
  return [
    'match',
    ['get', 'prioridad'],
    ...Object.entries(PRIORIDADES).flatMap(([prioridad, { color }]) => [Number(prioridad), color]),
    PRIORIDADES[5].color,
  ]
}

// Expresión de MapLibre: color de la base según el estado de la brigada
export function expresionColorBrigada() {
  return [
    'match',
    ['get', 'estado'],
    ...Object.entries(ESTADOS_BRIGADA).flatMap(([estado, { color }]) => [estado, color]),
    ESTADOS_BRIGADA.fuera_de_servicio.color,
  ]
}

// "hace 5 min", "hace 2 h", "hace 3 días"
export function textoAntiguedad(desdeMs, ahora = Date.now()) {
  if (typeof desdeMs !== 'number') return 'hora desconocida'
  const minutos = Math.max(0, Math.floor((ahora - desdeMs) / 60000))
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`
}

// Siguiente paso del brigadista según el estado de su brigada
export const SIGUIENTE_PASO = {
  asignada: { estado: 'en_camino', texto: 'Voy en camino' },
  en_camino: { estado: 'en_sitio', texto: 'Llegué al lugar' },
  en_sitio: { estado: 'terminado', texto: 'Terminé' },
}

// Enlace para abrir la ruta en la app de mapas del celular.
// OJO: aquí el orden es latitud,longitud (así lo pide Google Maps), al revés que GeoJSON.
export function enlaceAbrirEnMapas([longitud, latitud]) {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitud},${longitud}`
}
