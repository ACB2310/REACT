// Textos y colores de los refugios

export const ESTADOS_REFUGIO = {
  abierto: { etiqueta: 'Abierto', color: '#16a34a' },
  lleno: { etiqueta: 'Lleno', color: '#d97706' },
  cerrado: { etiqueta: 'Cerrado', color: '#6b7280' },
}

// Expresión de MapLibre que pinta cada refugio según su estado
export function expresionColorRefugio() {
  return [
    'match',
    ['get', 'estado'],
    'abierto', ESTADOS_REFUGIO.abierto.color,
    'lleno', ESTADOS_REFUGIO.lleno.color,
    ESTADOS_REFUGIO.cerrado.color,
  ]
}

export function etiquetaEstadoRefugio(estado) {
  return ESTADOS_REFUGIO[estado]?.etiqueta ?? 'Estado desconocido'
}

// "45 de 120 lugares ocupados" o "Capacidad desconocida"
export function textoOcupacion({ ocupacion, capacidad }) {
  if (typeof capacidad !== 'number') return 'Capacidad desconocida'
  return `${ocupacion ?? 0} de ${capacidad} lugares ocupados`
}
