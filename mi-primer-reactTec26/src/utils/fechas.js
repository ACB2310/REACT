// Formateador de fecha y hora en la zona de Ciudad de México.
// Se crea una sola vez porque construir un Intl.DateTimeFormat es costoso.
const formateador = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// Convierte milisegundos desde 1970 (como los da USGS) en texto legible.
// Ejemplo: 1700000000000 → "14 nov 2023, 16:13"
export function formatearFechaHora(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return 'sin fecha'
  return formateador.format(ms)
}
