import { describe, it, expect, vi } from 'vitest'
import {
  ErrorRutas,
  INSTRUCCION_TRANSBORDO,
  TIEMPO_A_PIE_TRANSBORDO_S,
  TIEMPO_DESCENSO_S,
  areaKm2,
  circuloAlrededor,
  codigoErrorOrs,
  distanciaKm,
  lineaTocaAnillo,
  obstaculosParaRuta,
  ordenarPorTiempo,
  planificarRuta,
  puntoEnAnillo,
  refugiosCandidatos,
  resumirRuta,
} from './logica.js'

// Guadalajara: cada 0.01° ≈ 1 km
const ORIGEN = [-103.35, 20.67]

function cuadrado([lng, lat], lado = 0.005) {
  return [
    [lng, lat],
    [lng + lado, lat],
    [lng + lado, lat + lado],
    [lng, lat + lado],
    [lng, lat],
  ]
}
function zona(id, esquina, severidad = 1, lado = 0.005) {
  return { id, severidad, geojson: JSON.stringify({ type: 'Polygon', coordinates: [cuadrado(esquina, lado)] }) }
}
function refugio(id, longitud, latitud, estado = 'abierto') {
  return { id, nombre: `Refugio ${id}`, estado, longitud, latitud }
}
function bloqueo(id, tipo, longitud, latitud) {
  return { id, tipo, longitud, latitud }
}
function rutaOrs(coordenadas, duracion = 600, distancia = 1000) {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coordenadas },
    properties: {
      summary: { distance: distancia, duration: duracion },
      segments: [{ steps: [{ instruction: 'Gira a la derecha', distance: 120.4 }, { instruction: 'Llegaste', distance: 0 }] }],
    },
  }
}

describe('geometría', () => {
  it('distancia en km con [longitud, latitud]', () => {
    // 0.1° de longitud a 20.67° de latitud ≈ 10.4 km
    expect(distanciaKm([-103.3, 20.67], [-103.4, 20.67])).toBeCloseTo(10.42, 1)
  })

  it('círculo de 25 m: cerrado, con el centro dentro y un punto a 50 m fuera', () => {
    const anillo = circuloAlrededor(ORIGEN)
    expect(anillo[0]).toEqual(anillo.at(-1))
    expect(puntoEnAnillo(ORIGEN, anillo)).toBe(true)
    expect(puntoEnAnillo([ORIGEN[0] + 0.0005, ORIGEN[1]], anillo)).toBe(false)
  })

  it('área de un cuadrado de ~550 m ≈ 0.29 km²', () => {
    expect(areaKm2(cuadrado(ORIGEN))).toBeCloseTo(0.29, 1)
  })

  it('una línea que atraviesa un cuadrado lo toca aunque ningún vértice quede dentro', () => {
    const anillo = cuadrado([-103.35, 20.67])
    expect(lineaTocaAnillo([[-103.36, 20.6725], [-103.34, 20.6725]], anillo)).toBe(true)
    expect(lineaTocaAnillo([[-103.36, 20.69], [-103.34, 20.69]], anillo)).toBe(false)
  })
})

describe('refugiosCandidatos', () => {
  it('solo abiertos, con ubicación, fuera de zonas de severidad 1 y del más cercano al más lejano', () => {
    const lista = refugiosCandidatos(
      ORIGEN,
      [
        refugio(1, -103.30, 20.67),
        refugio(2, -103.34, 20.67),
        refugio(3, -103.345, 20.67, 'lleno'),
        refugio(4, null, null),
        refugio(5, -103.3365, 20.6735), // dentro de la zona 9
        refugio(6, -104.5, 20.67), // a más de 30 km
      ],
      [zona(9, [-103.339, 20.671]), zona(10, [-103.30, 20.67], 2)],
    )
    expect(lista.map((r) => r.id)).toEqual([2, 1])
    expect(lista[0].posicion).toEqual([-103.34, 20.67])
  })
})

describe('ordenarPorTiempo', () => {
  it('ordena por duración y quita los que no tienen ruta', () => {
    const ordenados = ordenarPorTiempo([{ id: 1 }, { id: 2 }, { id: 3 }], [900, null, 300])
    expect(ordenados.map((c) => c.id)).toEqual([3, 1])
  })
})

describe('obstaculosParaRuta', () => {
  const DESTINO = [-103.30, 20.67]
  const bloqueos = [bloqueo(1, 'total', -103.33, 20.67), bloqueo(2, 'solo_vehiculos', -103.32, 20.67)]

  it('a pie evita solo los bloqueos totales', () => {
    const { evitados, avoid } = obstaculosParaRuta({ bloqueos, zonas: [], modo: 'a_pie', origen: ORIGEN, destino: DESTINO })
    expect(evitados).toEqual({ bloqueos: 1, zonas: 0 })
    expect(avoid.type).toBe('MultiPolygon')
  })

  it('en carro evita también los parciales', () => {
    const { evitados } = obstaculosParaRuta({ bloqueos, zonas: [], modo: 'carro', origen: ORIGEN, destino: DESTINO })
    expect(evitados).toEqual({ bloqueos: 2, zonas: 0 })
  })

  it('solo manda lo que está cerca del camino', () => {
    const lejos = [bloqueo(3, 'total', -103.80, 21.20)]
    const resultado = obstaculosParaRuta({ bloqueos: lejos, zonas: [], modo: 'a_pie', origen: ORIGEN, destino: DESTINO })
    expect(resultado.avoid).toBeNull()
    // …pero lo sigue revisando después
    expect(resultado.todos).toHaveLength(1)
  })

  it('no evita la zona en la que está la persona y lo avisa; las de precaución no se evitan', () => {
    const zonas = [zona(1, [-103.352, 20.668]), zona(2, [-103.32, 20.67]), zona(3, [-103.31, 20.67], 2)]
    const resultado = obstaculosParaRuta({ bloqueos: [], zonas, modo: 'a_pie', origen: ORIGEN, destino: DESTINO })
    expect(resultado.origenEnZona).toBe(1)
    expect(resultado.evitados.zonas).toBe(1)
    expect(resultado.todos.map((o) => o.id)).toEqual([2])
  })

  it('no evita el bloqueo junto al que está parada la persona', () => {
    const resultado = obstaculosParaRuta({
      bloqueos: [bloqueo(1, 'total', ORIGEN[0], ORIGEN[1])],
      zonas: [],
      modo: 'a_pie',
      origen: ORIGEN,
      destino: DESTINO,
    })
    expect(resultado.avoid).toBeNull()
  })

  it('nunca rebasa los límites de ORS: lo que no cabe no se manda (pero se revisa después)', () => {
    // 12 zonas de ~18 km² (≈ 4.3 km de lado) seguidas: no caben todas en 190 km² ni en 19.5 km
    const zonas = Array.from({ length: 12 }, (_, i) => zona(i + 1, [-103.34 + i * 0.04, 20.65], 1, 0.039))
    const resultado = obstaculosParaRuta({ bloqueos: [], zonas, modo: 'a_pie', origen: ORIGEN, destino: [-102.90, 20.67] })
    const anillos = resultado.avoid.coordinates.map(([anillo]) => anillo)
    const area = anillos.reduce((suma, anillo) => suma + areaKm2(anillo), 0)
    expect(area).toBeLessThanOrEqual(190)
    expect(resultado.omitidos).toBeGreaterThan(0)
    expect(resultado.todos).toHaveLength(12)
  })
})

describe('resumirRuta y errores de ORS', () => {
  it('distancia, tiempo e instrucciones', () => {
    expect(resumirRuta(rutaOrs([ORIGEN, [-103.34, 20.67]], 615.6, 1234.4))).toEqual({
      distanciaM: 1234,
      duracionS: 616,
      pasos: [
        { instruccion: 'Gira a la derecha', distanciaM: 120 },
        { instruccion: 'Llegaste', distanciaM: 0 },
      ],
    })
  })

  it('traduce los errores de ORS', () => {
    expect(codigoErrorOrs(404, { error: { code: 2009 } })).toBe('SIN_RUTA')
    expect(codigoErrorOrs(403, {})).toBe('ORS_LLAVE')
    expect(codigoErrorOrs(429, {})).toBe('ORS_LIMITE')
    expect(codigoErrorOrs(500, {})).toBe('ORS_ERROR')
  })
})

describe('planificarRuta', () => {
  const refugios = [refugio(1, -103.30, 20.67), refugio(2, -103.34, 20.70), refugio(3, -103.38, 20.67)]

  function lineaRecta(origen, destino) {
    return rutaOrs([origen, destino], distanciaKm(origen, destino) * 100)
  }

  it('elige el refugio con menor tiempo real de ruta, no el más cercano', async () => {
    const pedirMatriz = vi.fn(async () => [600, 300, 900])
    // La ruta al refugio 2 (el más rápido según la matriz) en realidad tarda más
    const pedirRuta = vi.fn(async (perfil, origen, destino) =>
      rutaOrs([origen, destino], destino[0] === -103.34 ? 2000 : 700),
    )

    const resultado = await planificarRuta({ origen: ORIGEN, modo: 'a_pie', refugios, bloqueos: [], zonas: [], pedirMatriz, pedirRuta })

    // Candidatos del más cercano al más lejano: 3 (3.1 km), 2 (3.5 km) y 1 (5.2 km)
    expect(pedirMatriz).toHaveBeenCalledWith('foot-walking', [ORIGEN, [-103.38, 20.67], [-103.34, 20.70], [-103.30, 20.67]])
    expect(pedirRuta).toHaveBeenCalledTimes(3)
    expect(resultado.estado).toBe('ruta')
    expect(resultado.destino.id).not.toBe(2)
    expect(resultado.resumen.duracionS).toBe(700)
  })

  it('en carro usa driving-car y manda los bloqueos parciales', async () => {
    const pedirRuta = vi.fn(async (perfil, origen, destino) => lineaRecta(origen, destino))
    await planificarRuta({
      origen: ORIGEN,
      modo: 'carro',
      refugios: [refugio(1, -103.30, 20.67)],
      bloqueos: [bloqueo(5, 'solo_vehiculos', -103.32, 20.675)],
      zonas: [],
      pedirMatriz: async () => [300],
      pedirRuta,
    })
    expect(pedirRuta.mock.calls[0][0]).toBe('driving-car')
    expect(pedirRuta.mock.calls[0][3].coordinates).toHaveLength(1)
  })

  it('descarta una ruta que cruza un bloqueo total y dice que no hay ruta', async () => {
    const resultado = await planificarRuta({
      origen: ORIGEN,
      modo: 'a_pie',
      refugios: [refugio(1, -103.30, 20.67)],
      // El bloqueo queda justo en la línea recta, y ORS (falso) no lo evita
      bloqueos: [bloqueo(7, 'total', -103.32, 20.67)],
      zonas: [],
      pedirMatriz: async () => [300],
      pedirRuta: async (perfil, origen, destino) => lineaRecta(origen, destino),
    })
    expect(resultado).toEqual({ estado: 'sin-ruta', motivo: 'bloqueada' })
  })

  it('sin refugios abiertos cerca lo dice', async () => {
    const resultado = await planificarRuta({
      origen: ORIGEN,
      modo: 'a_pie',
      refugios: [refugio(1, -103.30, 20.67, 'cerrado')],
      bloqueos: [],
      zonas: [],
      pedirMatriz: vi.fn(),
      pedirRuta: vi.fn(),
    })
    expect(resultado).toEqual({ estado: 'sin-ruta', motivo: 'sin-refugios' })
  })

  it('si la matriz no llega a ninguno lo dice', async () => {
    const resultado = await planificarRuta({
      origen: ORIGEN,
      modo: 'a_pie',
      refugios,
      bloqueos: [],
      zonas: [],
      pedirMatriz: async () => [null, null, null],
      pedirRuta: vi.fn(),
    })
    expect(resultado.motivo).toBe('sin-acceso')
  })

  it('"sin ruta" en ORS para uno no impide usar otro', async () => {
    const pedirRuta = vi.fn(async (perfil, origen, destino) => {
      if (destino[0] === -103.34) throw new ErrorRutas('SIN_RUTA')
      return lineaRecta(origen, destino)
    })
    const resultado = await planificarRuta({
      origen: ORIGEN,
      modo: 'a_pie',
      refugios,
      bloqueos: [],
      zonas: [],
      pedirMatriz: async () => [600, 300, 900],
      pedirRuta,
    })
    expect(resultado.estado).toBe('ruta')
    expect(resultado.destino.id).not.toBe(2)
  })

  it('un error grave de ORS (límite) se informa si no hubo ninguna ruta', async () => {
    await expect(
      planificarRuta({
        origen: ORIGEN,
        modo: 'a_pie',
        refugios,
        bloqueos: [],
        zonas: [],
        pedirMatriz: async () => [600, 300, 900],
        pedirRuta: async () => {
          throw new ErrorRutas('ORS_LIMITE')
        },
      }),
    ).rejects.toMatchObject({ codigo: 'ORS_LIMITE' })
  })

  it('avisa si la persona está dentro de una zona de peligro', async () => {
    const resultado = await planificarRuta({
      origen: ORIGEN,
      modo: 'a_pie',
      refugios: [refugio(1, -103.30, 20.67)],
      bloqueos: [],
      zonas: [zona(1, [-103.352, 20.668])],
      pedirMatriz: async () => [300],
      pedirRuta: async (perfil, origen, destino) => lineaRecta(origen, destino),
    })
    expect(resultado.estado).toBe('ruta')
    expect(resultado.origenEnZona).toBe(true)
  })
})

describe('ruta combinada (carro + a pie)', () => {
  // El refugio queda a ~5 km al este. El carro no puede llegar hasta él, pero sí cerca.
  const REFUGIO = [-103.30, 20.67]
  const refugios = [refugio(1, ...REFUGIO)]
  // Isócrona a pie (falsa): círculo de ~850 m alrededor del refugio, con 48 vértices
  const RADIO = 0.008
  const isocrona = {
    type: 'Polygon',
    coordinates: [
      Array.from({ length: 49 }, (_, k) => {
        const angulo = ((k % 48) / 48) * 2 * Math.PI
        return [REFUGIO[0] + RADIO * Math.cos(angulo), REFUGIO[1] + RADIO * Math.sin(angulo)]
      }),
    ],
  }
  const esRefugio = (p) => p[0] === REFUGIO[0] && p[1] === REFUGIO[1]

  // ORS falso: en carro 90 s por km (no llega al refugio); a pie 720 s por km.
  // `lentoCerca`: en carro, los puntos a menos de 500 m del refugio tardan mucho más.
  function orsFalso({ lentoCerca = false, rutaAPie } = {}) {
    const segundosCarro = (p) => distanciaKm(ORIGEN, p) * 90 + (lentoCerca && distanciaKm(p, REFUGIO) < 0.5 ? 3000 : 0)
    return {
      pedirMatriz: vi.fn(async (perfil, puntos) => {
        const [desde, ...hacia] = puntos
        if (perfil === 'driving-car') return hacia.map((p) => (esRefugio(p) ? 300 : segundosCarro(p)))
        return hacia.map((p) => distanciaKm(desde, p) * 720)
      }),
      pedirRuta: vi.fn(async (perfil, origen, destino) => {
        if (perfil === 'driving-car') {
          if (esRefugio(destino)) throw new ErrorRutas('SIN_RUTA')
          return rutaOrs([origen, destino], segundosCarro(destino), distanciaKm(origen, destino) * 1000)
        }
        if (rutaAPie) return rutaAPie(origen, destino)
        return rutaOrs([origen, destino], distanciaKm(origen, destino) * 720, distanciaKm(origen, destino) * 1000)
      }),
      pedirIsocrona: vi.fn(async () => isocrona),
    }
  }

  async function combinada(opciones = {}, extra = {}) {
    const ors = orsFalso(opciones)
    const resultado = await planificarRuta({ origen: ORIGEN, modo: 'carro', refugios, bloqueos: [], zonas: [], ...ors, ...extra })
    return { resultado, ors }
  }

  it('si el carro no llega al refugio, propone bajar en un punto y seguir a pie', async () => {
    const { resultado, ors } = await combinada()

    expect(ors.pedirIsocrona).toHaveBeenCalledWith('foot-walking', REFUGIO, TIEMPO_A_PIE_TRANSBORDO_S, null)
    expect(resultado.estado).toBe('ruta')
    expect(resultado.modo).toBe('combinada')
    expect(resultado.destino.id).toBe(1)
    // Dos tramos: primero en carro, luego a pie, unidos en el punto de transbordo
    const [carro, aPie] = resultado.ruta.features
    expect(resultado.ruta.type).toBe('FeatureCollection')
    expect(carro.properties.modo).toBe('carro')
    expect(aPie.properties.modo).toBe('a_pie')
    expect(carro.geometry.coordinates.at(-1)).toEqual(resultado.transbordo)
    expect(aPie.geometry.coordinates[0]).toEqual(resultado.transbordo)
    expect(aPie.geometry.coordinates.at(-1)).toEqual(REFUGIO)
    // El total suma los dos tramos y el tiempo para bajar del vehículo
    const { tramos, resumen } = resultado
    expect(tramos.descensoS).toBe(TIEMPO_DESCENSO_S)
    expect(resumen.duracionS).toBe(tramos.carro.duracionS + TIEMPO_DESCENSO_S + tramos.aPie.duracionS)
    expect(resumen.distanciaM).toBe(tramos.carro.distanciaM + tramos.aPie.distanciaM)
    expect(resumen.pasos.map((p) => p.instruccion)).toContain(INSTRUCCION_TRANSBORDO)
  })

  it('elige el transbordo con menor tiempo TOTAL, no el más cercano al refugio', async () => {
    // Sin penalización gana un punto cerca del refugio (poco a pie); con ella, uno del borde
    const { resultado } = await combinada({ lentoCerca: true })
    expect(resultado.modo).toBe('combinada')
    expect(distanciaKm(resultado.transbordo, REFUGIO)).toBeGreaterThan(0.6)
  })

  it('ningún transbordo queda dentro de una zona de peligro ni junto a un bloqueo', async () => {
    // Zona al oeste del refugio, del lado de donde viene el carro
    const zonaOeste = zona(9, [-103.311, 20.664], 1, 0.008)
    const anilloZona = JSON.parse(zonaOeste.geojson).coordinates[0]
    const { resultado, ors } = await combinada({}, { zonas: [zonaOeste], bloqueos: [bloqueo(4, 'solo_vehiculos', -103.296, 20.67)] })

    expect(resultado.modo).toBe('combinada')
    expect(puntoEnAnillo(resultado.transbordo, anilloZona)).toBe(false)
    // Ningún candidato que se mandó a la matriz estaba dentro de la zona o a ≤ 25 m del bloqueo
    const candidatos = ors.pedirMatriz.mock.calls.filter(([perfil, puntos]) => perfil === 'driving-car' && puntos.length > 2)[0][1].slice(1)
    expect(candidatos.length).toBeGreaterThan(0)
    expect(candidatos.some((p) => puntoEnAnillo(p, anilloZona))).toBe(false)
    expect(candidatos.some((p) => distanciaKm(p, [-103.296, 20.67]) <= 0.025)).toBe(false)
  })

  it('un tramo a pie que cruza un bloqueo total se descarta', async () => {
    const BLOQUEO = [-103.3045, 20.67]
    // El ORS falso a pie va en línea recta (no evita nada)
    const { resultado } = await combinada({}, { bloqueos: [bloqueo(8, 'total', ...BLOQUEO)] })
    expect(resultado.modo).toBe('combinada')
    const [carro, aPie] = resultado.ruta.features
    const circulo = circuloAlrededor(BLOQUEO)
    expect(lineaTocaAnillo(aPie.geometry.coordinates, circulo)).toBe(false)
    expect(lineaTocaAnillo(carro.geometry.coordinates, circulo)).toBe(false)
  })

  it('si todos los tramos a pie cruzan un obstáculo, dice que no hay ruta', async () => {
    const BLOQUEO = [-103.3, 20.6705]
    const { resultado, ors } = await combinada(
      // Todo tramo a pie pasa junto al bloqueo pegado al refugio
      { rutaAPie: (origen, destino) => rutaOrs([origen, BLOQUEO, destino], 600, 800) },
      { bloqueos: [bloqueo(8, 'total', ...BLOQUEO)] },
    )
    expect(resultado).toEqual({ estado: 'sin-ruta', motivo: 'bloqueada' })
    // Sí se intentó: se pidieron los tramos a pie
    expect(ors.pedirRuta.mock.calls.some(([perfil]) => perfil === 'foot-walking')).toBe(true)
  })

  it('a pie nunca usa la ruta combinada', async () => {
    const ors = orsFalso()
    ors.pedirRuta.mockImplementation(async () => {
      throw new ErrorRutas('SIN_RUTA')
    })
    const resultado = await planificarRuta({ origen: ORIGEN, modo: 'a_pie', refugios, bloqueos: [], zonas: [], ...ors })
    expect(resultado.estado).toBe('sin-ruta')
    expect(ors.pedirIsocrona).not.toHaveBeenCalled()
  })

  it('si el carro sí llega, no se calcula la combinada', async () => {
    const ors = orsFalso()
    ors.pedirRuta.mockImplementation(async (perfil, origen, destino) => rutaOrs([origen, destino], 400))
    const resultado = await planificarRuta({ origen: ORIGEN, modo: 'carro', refugios, bloqueos: [], zonas: [], ...ors })
    expect(resultado.modo).toBe('carro')
    expect(ors.pedirIsocrona).not.toHaveBeenCalled()
  })

  it('si la combinada falla por un error de ORS, se responde el "sin ruta" original', async () => {
    const ors = orsFalso()
    ors.pedirIsocrona.mockImplementation(async () => {
      throw new ErrorRutas('ORS_LIMITE')
    })
    const resultado = await planificarRuta({ origen: ORIGEN, modo: 'carro', refugios, bloqueos: [], zonas: [], ...ors })
    expect(resultado).toEqual({ estado: 'sin-ruta', motivo: 'bloqueada' })
  })

  it('sin pedirIsocrona (versión vieja de la función) responde el "sin ruta" de siempre', async () => {
    const { pedirMatriz, pedirRuta } = orsFalso()
    const resultado = await planificarRuta({ origen: ORIGEN, modo: 'carro', refugios, bloqueos: [], zonas: [], pedirMatriz, pedirRuta })
    expect(resultado).toEqual({ estado: 'sin-ruta', motivo: 'bloqueada' })
  })
})

describe('ruta combinada: correcciones de la revisión', () => {
  const REFUGIO = [-103.30, 20.67]
  const refugios = [refugio(1, ...REFUGIO)]
  const isocrona = {
    type: 'Polygon',
    coordinates: [
      Array.from({ length: 49 }, (_, k) => {
        const angulo = ((k % 48) / 48) * 2 * Math.PI
        return [REFUGIO[0] + 0.008 * Math.cos(angulo), REFUGIO[1] + 0.008 * Math.sin(angulo)]
      }),
    ],
  }
  const esRefugio = (p) => p[0] === REFUGIO[0] && p[1] === REFUGIO[1]
  const recta = (origen, destino, segundosPorKm) =>
    rutaOrs([origen, destino], distanciaKm(origen, destino) * segundosPorKm, distanciaKm(origen, destino) * 1000)

  it('un punto al que la matriz no llega (null) no cuenta como 0 s', async () => {
    // La matriz en carro no llega a los puntos al este del refugio
    const pedirMatriz = vi.fn(async (perfil, puntos) => {
      const [desde, ...hacia] = puntos
      if (perfil === 'driving-car') return hacia.map((p) => (esRefugio(p) ? 300 : p[0] > REFUGIO[0] ? null : distanciaKm(desde, p) * 90))
      return hacia.map((p) => distanciaKm(desde, p) * 720)
    })
    const pedirRuta = vi.fn(async (perfil, origen, destino) => {
      if (perfil === 'driving-car' && (esRefugio(destino) || destino[0] > REFUGIO[0])) throw new ErrorRutas('SIN_RUTA')
      return recta(origen, destino, perfil === 'driving-car' ? 90 : 720)
    })
    const resultado = await planificarRuta({
      origen: ORIGEN, modo: 'carro', refugios, bloqueos: [], zonas: [], pedirMatriz, pedirRuta, pedirIsocrona: async () => isocrona,
    })
    expect(resultado.modo).toBe('combinada')
    expect(resultado.transbordo[0]).toBeLessThan(REFUGIO[0])
  })

  // El caso para el que existe la ruta combinada: un bloqueo en la calle de acceso al refugio.
  // La matriz no sabe del bloqueo, así que los "mejores" puntos son los que quedan pasando el bloqueo.
  it('con un bloqueo en la calle de acceso, el carro llega hasta antes del bloqueo', async () => {
    const BLOQUEO = [-103.304, 20.67]
    const pasandoElBloqueo = (p) => p[0] > BLOQUEO[0] - 0.0003
    const evitaElBloqueo = (avoid) =>
      (avoid?.coordinates ?? []).some(([anillo]) => puntoEnAnillo(BLOQUEO, anillo))
    const pedirMatriz = vi.fn(async (perfil, puntos) => {
      const [desde, ...hacia] = puntos
      return hacia.map((p) => distanciaKm(desde, p) * (perfil === 'driving-car' ? 90 : 720))
    })
    const pedirRuta = vi.fn(async (perfil, origen, destino, avoid) => {
      // En carro, pasando el bloqueo solo se llega si NO se evita el bloqueo (la calle es una sola)
      if (perfil === 'driving-car' && pasandoElBloqueo(destino) && evitaElBloqueo(avoid)) throw new ErrorRutas('SIN_RUTA')
      return recta(origen, destino, perfil === 'driving-car' ? 90 : 720)
    })
    const resultado = await planificarRuta({
      origen: ORIGEN,
      modo: 'carro',
      refugios,
      bloqueos: [bloqueo(3, 'solo_vehiculos', ...BLOQUEO)],
      zonas: [],
      pedirMatriz,
      pedirRuta,
      pedirIsocrona: async () => isocrona,
    })
    expect(resultado.modo).toBe('combinada')
    // Se baja antes del bloqueo, a más de 25 m, y el tramo en carro no lo toca
    expect(resultado.transbordo[0]).toBeLessThan(BLOQUEO[0])
    expect(distanciaKm(resultado.transbordo, BLOQUEO)).toBeGreaterThan(0.025)
    expect(lineaTocaAnillo(resultado.ruta.features[0].geometry.coordinates, circuloAlrededor(BLOQUEO))).toBe(false)
    // El bloqueo es parcial: a pie SÍ se pasa por él (el tramo a pie lo cruza)
    expect(lineaTocaAnillo(resultado.ruta.features[1].geometry.coordinates, circuloAlrededor(BLOQUEO))).toBe(true)
  })

  // ORS ajusta el inicio del tramo a pie a la banqueta más cercana: si queda lejos de donde
  // terminó el carro, ese hueco no se dibujaría ni se revisaría
  it('si el tramo a pie empieza lejos de donde terminó el carro, se descarta', async () => {
    const pedirMatriz = vi.fn(async (perfil, puntos) => {
      const [desde, ...hacia] = puntos
      return hacia.map((p) => (perfil === 'driving-car' && esRefugio(p) ? 300 : distanciaKm(desde, p) * (perfil === 'driving-car' ? 90 : 720)))
    })
    const pedirRuta = vi.fn(async (perfil, origen, destino) => {
      if (perfil === 'driving-car') {
        if (esRefugio(destino)) throw new ErrorRutas('SIN_RUTA')
        return recta(origen, destino, 90)
      }
      // A pie, ORS empieza 200 m al norte de donde lo dejó el carro
      const inicio = [origen[0], origen[1] + 0.0018]
      return rutaOrs([inicio, destino], 600, 900)
    })
    const resultado = await planificarRuta({
      origen: ORIGEN, modo: 'carro', refugios, bloqueos: [], zonas: [], pedirMatriz, pedirRuta, pedirIsocrona: async () => isocrona,
    })
    expect(resultado).toEqual({ estado: 'sin-ruta', motivo: 'bloqueada' })
  })

  it('el tramo en carro no termina con "Llegaste": sigue la instrucción de bajarse', async () => {
    const pedirMatriz = vi.fn(async (perfil, puntos) => {
      const [desde, ...hacia] = puntos
      return hacia.map((p) => distanciaKm(desde, p) * (perfil === 'driving-car' ? 90 : 720))
    })
    const pedirRuta = vi.fn(async (perfil, origen, destino) => {
      if (perfil === 'driving-car' && esRefugio(destino)) throw new ErrorRutas('SIN_RUTA')
      return recta(origen, destino, perfil === 'driving-car' ? 90 : 720)
    })
    const resultado = await planificarRuta({
      origen: ORIGEN, modo: 'carro', refugios, bloqueos: [], zonas: [], pedirMatriz, pedirRuta, pedirIsocrona: async () => isocrona,
    })
    const pasos = resultado.resumen.pasos.map((p) => p.instruccion)
    const bajarse = pasos.indexOf(INSTRUCCION_TRANSBORDO)
    expect(pasos[bajarse - 1]).not.toBe('Llegaste')
    expect(pasos.at(-1)).toBe('Llegaste')
  })
})
