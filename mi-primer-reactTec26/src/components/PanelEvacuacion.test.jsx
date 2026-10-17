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
    ['sin-zona-offline', 'Sin conexión y sin calles guardadas de esta zona. Cuando tengas señal, toca "Ruta a punto de reunión" para guardarlas.'],
  ])('estado %s', (estado, texto) => {
    mostrar({ estado })
    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it('error muestra el mensaje real', () => {
    mostrar({ estado: 'error', error: 'OpenStreetMap respondió 429' })
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo calcular la ruta: OpenStreetMap respondió 429')
  })

  it('ubicación imprecisa dice el margen y cómo mejorarlo', () => {
    mostrar({ estado: 'ubicacion-imprecisa', precisionM: 1530.4 })
    expect(
      screen.getByText(
        'Tu ubicación es aproximada (margen de 1530 m). Activa la ubicación precisa del teléfono o sal a un lugar abierto y vuelve a intentar.',
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

    it('dice la fuente y cuándo se descargaron las calles y se tomó la ubicación', () => {
      conRuta()
      expect(screen.getByText(/^Calles y puntos de reunión © OpenStreetMap · descargado /)).toHaveTextContent(
        /16 oct\.? 2026, 16:00/,
      )
      expect(screen.getByText(/^Tu ubicación: /)).toHaveTextContent(/16 oct\.? 2026, 16:05/)
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
