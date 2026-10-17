import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PanelEvacuacion from './PanelEvacuacion.jsx'

// 22:00 UTC = 16:00 en CDMX
const DESCARGADO = Date.UTC(2026, 9, 16, 22, 0)
const UBICADO = Date.UTC(2026, 9, 16, 22, 5)

function resultado(extra = {}) {
  return {
    estado: 'ok',
    distanciaM: 1040,
    nivelRiesgo: 'bajo',
    ruta: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
    puntoReunion: { nombre: 'Plaza Hidalgo', coordenadas: [-100.3, 25.67], tipo: 'punto-reunion' },
    ...extra,
  }
}

function mostrar(props = {}) {
  const buscarRuta = vi.fn()
  const limpiar = vi.fn()
  render(
    <PanelEvacuacion
      estado="inactivo"
      error={null}
      motivo={null}
      resultado={null}
      zona={null}
      ubicadoEn={null}
      precisionM={null}
      sinDatosSismos={false}
      sinDatosBloqueos={false}
      bloqueosSinConfirmarCerca={0}
      buscarRuta={buscarRuta}
      limpiar={limpiar}
      {...props}
    />,
  )
  return { buscarRuta, limpiar }
}

describe('PanelEvacuacion', () => {
  it('el botón llama buscarRuta', () => {
    const { buscarRuta } = mostrar()
    screen.getByRole('button', { name: 'Ruta a punto de reunión' }).click()
    expect(buscarRuta).toHaveBeenCalledTimes(1)
  })

  it('sin ruta no muestra Quitar ruta', () => {
    mostrar()
    expect(screen.queryByRole('button', { name: 'Quitar ruta' })).not.toBeInTheDocument()
  })

  it.each([
    ['ubicando', 'Buscando tu ubicación…'],
    ['descargando', 'Descargando calles y puntos de reunión de tu zona (puede tardar hasta 1 minuto)…'],
    ['calculando', 'Calculando la ruta más segura…'],
    ['sin-puntos', 'No hay puntos de reunión ni refugios abiertos registrados cerca de ti. Sigue las indicaciones de Protección Civil.'],
    ['lejos-de-calles', 'Estás lejos de las calles registradas; no se pudo calcular una ruta. Sigue las indicaciones de Protección Civil.'],
    ['sin-zona-offline', 'Sin conexión y sin calles guardadas de esta zona. Cuando tengas señal, toca "Ruta a punto de reunión" para guardarlas. Sigue las indicaciones de Protección Civil.'],
  ])('estado %s', (estado, texto) => {
    mostrar({ estado })
    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it('error muestra el mensaje real', () => {
    mostrar({ estado: 'error', error: 'OpenStreetMap respondió 429' })
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo calcular la ruta: OpenStreetMap respondió 429. Sigue las indicaciones de Protección Civil.')
  })

  it('ubicación imprecisa dice el margen y cómo mejorarlo', () => {
    mostrar({ estado: 'ubicacion-imprecisa', precisionM: 1530.4 })
    expect(
      screen.getByText(
        'Tu ubicación es aproximada (margen de 1530 m). Activa la ubicación precisa del teléfono o sal a un lugar abierto y vuelve a intentar. Sigue las indicaciones de Protección Civil.',
      ),
    ).toBeInTheDocument()
  })

  it('sin ruta lo dice explícitamente', () => {
    mostrar({ estado: 'sin-ruta', motivo: 'refugios-inalcanzables' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No encontramos una ruta segura a un punto de reunión. Sigue las indicaciones de Protección Civil.',
    )
  })

  it('si la persona está en una zona de peligro lo dice', () => {
    mostrar({ estado: 'sin-ruta', motivo: 'origen-en-zona-de-peligro' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Estás dentro de una zona de peligro (cerca del epicentro de un sismo fuerte o de un bloqueo total). Aléjate con cuidado y sigue las indicaciones de Protección Civil.',
    )
  })

  it('sin ruta avisa de los bloqueos sin confirmar cerca', () => {
    mostrar({ estado: 'sin-ruta', motivo: 'refugios-inalcanzables', bloqueosSinConfirmarCerca: 3 })
    expect(screen.getByText('Hay 3 bloqueos sin confirmar cerca que podrían estar cerrando el paso.')).toBeInTheDocument()
  })

  it('en singular cuando es uno', () => {
    mostrar({ estado: 'sin-ruta', motivo: 'refugios-inalcanzables', bloqueosSinConfirmarCerca: 1 })
    expect(screen.getByText('Hay 1 bloqueo sin confirmar cerca que podría estar cerrando el paso.')).toBeInTheDocument()
  })

  describe('con ruta', () => {
    const conRuta = (extra = {}) =>
      mostrar({ estado: 'listo', resultado: resultado(), zona: { descargadoEn: DESCARGADO }, ubicadoEn: UBICADO, ...extra })

    it('dice destino, distancia, minutos a pie y riesgo con palabras', () => {
      conRuta()
      expect(screen.getByText('Punto de reunión Plaza Hidalgo: 1.0 km · unos 15 min a pie · riesgo bajo')).toBeInTheDocument()
    })

    it('distancia en metros si es menor a 1 km', () => {
      conRuta({ resultado: resultado({ distanciaM: 650, nivelRiesgo: 'alto' }) })
      expect(screen.getByText('Punto de reunión Plaza Hidalgo: 650 m · unos 10 min a pie · riesgo alto')).toBeInTheDocument()
    })

    // Con datos reales: muchos puntos de OSM no tienen nombre y salía "Punto de reunión Punto de reunión"
    it('un punto de reunión sin nombre no repite el tipo', () => {
      conRuta({
        resultado: resultado({ puntoReunion: { nombre: 'Punto de reunión', coordenadas: [0, 0], tipo: 'punto-reunion' } }),
      })
      expect(screen.getByText('Punto de reunión: 1.0 km · unos 15 min a pie · riesgo bajo')).toBeInTheDocument()
    })

    it('un refugio dice que es refugio', () => {
      conRuta({
        resultado: resultado({ puntoReunion: { nombre: 'Escuela Juárez', coordenadas: [0, 0], tipo: 'refugio' } }),
      })
      expect(screen.getByText(/^Refugio Escuela Juárez: /)).toBeInTheDocument()
    })

    // Sin datos de USGS el riesgo sísmico NO es "bajo": es desconocido
    it('sin datos de sismos no dice "riesgo bajo" y lo advierte', () => {
      conRuta({ sinDatosSismos: true })
      expect(screen.queryByText(/riesgo bajo/)).not.toBeInTheDocument()
      expect(screen.getByText(/riesgo sísmico desconocido$/)).toBeInTheDocument()
      expect(screen.getByText('No hay datos de sismos: el riesgo sísmico de la ruta es desconocido.')).toBeInTheDocument()
    })

    // Una sola línea corta, para que el mapa no quede chico en el celular
    it('dice en una línea la fuente y cuándo se descargaron las calles y se tomó la ubicación', () => {
      conRuta()
      expect(screen.getByText(/^Fuentes: calles de © OpenStreetMap del /)).toHaveTextContent(
        /calles de © OpenStreetMap del 16 oct\.? 2026, 16:00 · tu ubicación del 16 oct\.? 2026, 16:05$/,
      )
    })

    it('si el destino es un refugio dice de cuándo es su estado (lista oficial)', () => {
      conRuta({
        resultado: resultado({
          puntoReunion: {
            nombre: 'Escuela Juárez',
            coordenadas: [0, 0],
            tipo: 'refugio',
            actualizadoEn: Date.UTC(2026, 9, 16, 21, 30),
          },
        }),
      })
      expect(screen.getByText(/^Fuentes: /)).toHaveTextContent(
        /· estado del refugio \(lista oficial\) del 16 oct\.? 2026, 15:30$/,
      )
    })

    // Sin señal desde que se abrió la app, los bloqueos reportados no llegaron
    it('sin datos de bloqueos avisa que la ruta no los toma en cuenta', () => {
      conRuta({ sinDatosBloqueos: true })
      expect(
        screen.getByText('No se pudieron cargar los bloqueos reportados: la ruta no los toma en cuenta.'),
      ).toBeInTheDocument()
    })

    it('con datos de bloqueos no muestra ese aviso', () => {
      conRuta()
      expect(screen.queryByText(/no los toma en cuenta/)).not.toBeInTheDocument()
    })

    it('recuerda que la ruta es informativa', () => {
      conRuta()
      expect(
        screen.getByText('Ruta calculada en tu teléfono; puede no reflejar daños recientes. Sigue las indicaciones oficiales.'),
      ).toBeInTheDocument()
    })

    it('Quitar ruta llama limpiar', () => {
      const { limpiar } = conRuta()
      screen.getByRole('button', { name: 'Quitar ruta' }).click()
      expect(limpiar).toHaveBeenCalledTimes(1)
    })
  })
})
