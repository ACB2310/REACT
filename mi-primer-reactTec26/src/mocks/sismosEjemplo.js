// DATOS DE EJEMPLO SOLO PARA PRUEBAS – no usar en producción
// Imita la estructura del feed GeoJSON de USGS (2.5_week.geojson).
// Las coordenadas van en [longitud, latitud, profundidad en km].

function crearSismo(id, mag, place, coordenadas) {
  return {
    type: 'Feature',
    id,
    properties: {
      mag,
      place,
      time: 1699990000000,
      updated: 1699995000000,
      tz: null,
      url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
      detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`,
      felt: null,
      cdi: null,
      mmi: null,
      alert: null,
      status: 'reviewed',
      tsunami: 0,
      sig: 400,
      net: 'us',
      code: id,
      ids: `,${id},`,
      sources: ',us,',
      types: ',origin,phase-data,',
      nst: null,
      dmin: 1.2,
      rms: 0.8,
      gap: 120,
      magType: 'mb',
      type: 'earthquake',
      title: mag === null ? place : `M ${mag} - ${place}`,
    },
    geometry: { type: 'Point', coordinates: coordenadas },
  }
}

export const sismosEjemplo = {
  type: 'FeatureCollection',
  metadata: {
    generated: 1700000000000,
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
    title: 'USGS Magnitude 2.5+ Earthquakes, Past Week',
    status: 200,
    api: '1.14.1',
    count: 4,
  },
  features: [
    crearSismo('oax1', 5.2, '20 km S de Pinotepa Nacional, Oaxaca', [-96.7, 16.1, 30]),
    crearSismo('gro1', 6.3, '15 km SO de Acapulco, Guerrero', [-99.9, 17.0, 20]),
    crearSismo('jpn1', 4.8, '50 km E de Sendai, Japón', [142.0, 38.0, 10]),
    crearSismo('bc1', null, '10 km S de Mexicali, Baja California', [-115.5, 32.0, 5]),
  ],
}
