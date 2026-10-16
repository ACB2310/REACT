// DATOS DE EJEMPLO SOLO PARA PRUEBAS – no usar en producción
// Copian la forma real de las respuestas del 16 oct 2026:
// - NOAA (servicio NHC_tropical_weather_summary): huracán Trudy en EP1
// - GDACS: Simon (que NOAA no publica en sus capas) y Trudy
// Coordenadas en [longitud, latitud].

function puntoNhc(tau, coordenadas, extra = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coordenadas },
    properties: {
      objectid: 6164 + tau,
      stormname: 'Hurricane Trudy',
      stormtype: 'HU',
      dvlbl: 'H',
      basin: 'EP',
      advdate: '300 PM CST Fri Oct 16 2026',
      advisnum: '14',
      fcstprd: 120,
      gust: 90,
      maxwind: 75,
      mslp: 982,
      ssnum: 1,
      datelbl: '3:00 PM Fri',
      tcdvlp: 'Hurricane',
      tcdir: 330,
      tcspd: 4,
      fldatelbl: '2026-10-16 12:00 PM Fri CST',
      lat: coordenadas[1],
      lon: coordenadas[0],
      stormnum: 21,
      stormsrc: 'Tropical Cyclone',
      tau,
      timezone: 'CST',
      validtime: '16/1800',
      idp_source: 'ep212026-014_5day_pts',
      idp_filedate: 1792184930000,
      idp_ingestdate: 1792185059000,
      binnumber: 'EP1',
      ...extra,
    },
  }
}

function propiedadesComunesNhc(extra) {
  return {
    stormname: 'Trudy',
    stormtype: 'HU',
    basin: 'EP',
    advdate: '300 PM CST Fri Oct 16 2026',
    advisnum: '14',
    fcstprd: 120,
    stormnum: 21,
    idp_filedate: 1792184930000,
    binnumber: 'EP1',
    ...extra,
  }
}

export const nhcEjemplo = {
  puntos: {
    type: 'FeatureCollection',
    features: [
      puntoNhc(0, [-102, 15]),
      // Como en la respuesta real: en los puntos de pronóstico NOAA manda 9999 = "sin dato"
      puntoNhc(12, [-102.4, 15.8], {
        maxwind: 80,
        gust: 100,
        mslp: 9999,
        tcdir: 9999,
        tcspd: 9999,
        datelbl: '12:00 AM Sat',
      }),
    ],
  },
  trayectorias: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-102, 15], [-102.4, 15.8], [-103, 17]] },
        properties: propiedadesComunesNhc({ idp_source: 'ep212026-014_5day_lin' }),
      },
    ],
  },
  conos: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[-102.6, 14.5], [-101.4, 14.6], [-102.2, 17.5], [-104, 17.4], [-102.6, 14.5]]],
        },
        properties: propiedadesComunesNhc({ idp_source: 'ep212026-014_5day_pgn' }),
      },
    ],
  },
  avisos: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-101.5, 17.6], [-101, 17.4]] },
        properties: propiedadesComunesNhc({ tcww: 'TWA', idp_source: 'ep212026-014_ww_wwlin' }),
      },
    ],
  },
}

export const puntosNhcEjemplo = nhcEjemplo.puntos

// Respuesta cruda de GDACS (geteventlist?eventlist=TC), recortada a 4 eventos
function eventoGdacsCrudo({ eventid, eventname, coordenadas, iscurrent, alertlevel, episodealertlevel, datemodified }) {
  return {
    type: 'Feature',
    bbox: [coordenadas[0], coordenadas[1], coordenadas[0], coordenadas[1]],
    geometry: { type: 'Point', coordinates: coordenadas },
    properties: {
      eventtype: 'TC',
      eventid,
      episodeid: 38,
      eventname,
      glide: '',
      name: `Tropical Cyclone ${eventname}`,
      description: `Tropical Cyclone ${eventname}`,
      htmldescription: `Tropical Cyclone ${eventname}`,
      icon: 'https://www.gdacs.org/images/gdacs_icons/maps/Green/TC.png',
      iconoverall: 'https://www.gdacs.org/images/gdacs_icons/maps/Orange/TC.png',
      url: {
        geometry: `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${eventid}&episodeid=38`,
        report: `https://www.gdacs.org/report.aspx?eventid=${eventid}&episodeid=38&eventtype=TC`,
        details: `https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=TC&eventid=${eventid}`,
      },
      alertlevel,
      alertscore: 2,
      episodealertlevel,
      episodealertscore: 1,
      istemporary: 'false',
      iscurrent,
      country: 'México',
      fromdate: '2026-10-07T15:00:00',
      todate: '2026-10-16T21:00:00',
      datemodified,
      iso3: 'MEX',
      source: 'NOAA',
      sourceid: '',
      polygonlabel: 'Centroid',
      Class: 'Point_Centroid',
      countryonland: '',
      affectedcountries: [],
      severitydata: { severity: 55, severitytext: 'Tropical Depression', severityunit: 'km/h' },
    },
  }
}

export const respuestaGdacsEjemplo = {
  type: 'FeatureCollection',
  bbox: [-180, -90, 180, 90],
  features: [
    eventoGdacsCrudo({
      eventid: 1001335, eventname: 'SIMON-26', coordenadas: [-110.3, 21.5], iscurrent: 'true',
      alertlevel: 'Orange', episodealertlevel: 'Green', datemodified: '2026-10-16T20:53:55',
    }),
    eventoGdacsCrudo({
      eventid: 1001340, eventname: 'TRUDY-26', coordenadas: [-102, 15], iscurrent: 'true',
      alertlevel: 'Orange', episodealertlevel: 'Orange', datemodified: '2026-10-16T21:10:00',
    }),
    eventoGdacsCrudo({
      eventid: 1001290, eventname: 'POLO-26', coordenadas: [-108, 30.5], iscurrent: 'false',
      alertlevel: 'Red', episodealertlevel: 'Green', datemodified: '2026-09-30T03:00:00',
    }),
    eventoGdacsCrudo({
      eventid: 1001350, eventname: 'CHAMPI-26', coordenadas: [150.2, 11.9], iscurrent: 'true',
      alertlevel: 'Red', episodealertlevel: 'Red', datemodified: '2026-10-16T18:00:00',
    }),
  ],
}

// Eventos de GDACS ya filtrados y aplanados, como los deja services/gdacs.js
export const eventosGdacsEjemplo = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-110.3, 21.5] },
      properties: {
        eventid: 1001335,
        eventname: 'SIMON-26',
        alertlevel: 'Orange',
        episodealertlevel: 'Green',
        fechaModificacion: Date.UTC(2026, 9, 16, 20, 53, 55),
        urlReporte: 'https://www.gdacs.org/report.aspx?eventid=1001335&episodeid=38&eventtype=TC',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-102, 15] },
      properties: {
        eventid: 1001340,
        eventname: 'TRUDY-26',
        alertlevel: 'Orange',
        episodealertlevel: 'Orange',
        fechaModificacion: Date.UTC(2026, 9, 16, 21, 10, 0),
        urlReporte: 'https://www.gdacs.org/report.aspx?eventid=1001340&episodeid=38&eventtype=TC',
      },
    },
  ],
}
