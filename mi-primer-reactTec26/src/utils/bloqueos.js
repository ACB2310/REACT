// Textos y colores de los bloqueos, y reglas sencillas para la interfaz.
// Las reglas de verdad (quién puede qué) están en el servidor (supabase/migrations/);
// aquí solo se decide qué botones mostrar.

export const TIPOS_BLOQUEO = {
  solo_vehiculos: {
    etiqueta: 'Parcial',
    detalle: 'No pasan vehículos. Se puede pasar a pie.',
    color: '#f97316',
  },
  total: {
    etiqueta: 'Total',
    detalle: 'No pasa nadie, ni a pie.',
    color: '#dc2626',
  },
}

// Expresión de MapLibre que pinta cada bloqueo según su tipo
export function expresionColorBloqueo() {
  return ['match', ['get', 'tipo'], 'total', TIPOS_BLOQUEO.total.color, TIPOS_BLOQUEO.solo_vehiculos.color]
}

// "Vence en 3 h", "Vence en 25 min" o "Vencido"
export function textoVencimiento(expiraEn, ahora = Date.now()) {
  if (typeof expiraEn !== 'number') return 'Vencimiento desconocido'
  const minutos = Math.floor((expiraEn - ahora) / 60000)
  if (minutos <= 0) return 'Vencido'
  if (minutos < 60) return `Vence en ${minutos} min`
  return `Vence en ${Math.floor(minutos / 60)} h`
}

// ¿Mostrar los botones Renovar y Eliminar? Sí a quien lo reportó,
// y a brigadistas y coordinadores.
export function puedeGestionarBloqueo(bloqueo, rol) {
  return Boolean(bloqueo?.esMio) || rol === 'brigadista' || rol === 'coordinador'
}

export const LIMITE_DESCRIPCION = 280
