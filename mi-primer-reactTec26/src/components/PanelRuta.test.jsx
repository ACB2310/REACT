import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, renderHook, act } from '@testing-library/react'
import PanelRuta from './PanelRuta.jsx'
import { useModoRuta } from '../hooks/useModoRuta.js'
import { textoDuracion, textoEvitados, enlaceRutaEnMapas } from '../utils/rutas.js'

const ORIGEN = [-103.35, 20.67]
const RESULTADO = {
  estado: 'ruta',
  modo: 'carro',
  destino: { id: 1, nombre: 'Escuela Juárez', posicion: [-103.34, 20.68] },
  ruta: { type: 'Feature', geometry: { type: 'LineString', coordinates: [ORIGEN, [-103.34, 20.68]] }, properties: { modo: 'carro' } },
  resumen: {
    distanciaM: 4321,
    duracionS: 720,
    pasos: [
      { instruccion: 'Gira a la derecha en Av. Juárez', distanciaM: 850 },
      { instruccion: 'Llegaste a tu destino', distanciaM: 0 },
    ],
  },
  evitados: { bloqueos: 2, zonas: 1 },
  origenEnZona: false,
  consultadoEn: 1700000000000,
}

function ruta(cambios = {}) {
  return { estado: 'inactivo', resultado: null, origen: null, error: null, aviso: null, buscar: vi.fn(), limpiar: vi.fn(), ...cambios }
}
const EVACUACION = { estado: 'zona-lista', buscarRuta: vi.fn(), limpiar: vi.fn() }

function mostrar(props = {}) {
  const alCambiarModo = vi.fn()
  render(<PanelRuta ruta={ruta()} evacuacion={EVACUACION} modo="a_pie" alCambiarModo={alCambiarModo} {...props} />)
  return alCambiarModo
}

describe('PanelRuta', () => {
  it('un solo botón "Ruta a refugio" y el selector A pie / En carro', () => {
    const buscar = vi.fn()
    const alCambiarModo = mostrar({ ruta: ruta({ buscar }) })

    expect(screen.getByRole('button', { name: 'A pie' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'En carro' }))
    expect(alCambiarModo).toHaveBeenCalledWith('carro')

    fireEvent.click(screen.getByRole('button', { name: 'Ruta a refugio' }))
    expect(buscar).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Ruta a punto de reunión' })).toBeNull()
  })

  it('mientras calcula no deja tocar de nuevo y lo dice', () => {
    mostrar({ ruta: ruta({ estado: 'calculando' }) })
    expect(screen.getByText('Calculando la ruta más rápida a un refugio…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ruta a refugio' })).toBeDisabled()
  })

  it('con ruta muestra destino, tiempo, lo que evita, indicaciones, enlace y fuente', () => {
    mostrar({ ruta: ruta({ estado: 'listo', resultado: RESULTADO, origen: ORIGEN }), modo: 'carro' })

    expect(screen.getByText('Refugio Escuela Juárez: 12 min en carro · 4.3 km')).toBeInTheDocument()
    expect(screen.getByText('Evita 2 bloqueos y 1 zona de peligro')).toBeInTheDocument()
    expect(screen.getByText('Indicaciones (2)')).toBeInTheDocument()
    expect(screen.getByText('Gira a la derecha en Av. Juárez (850 m)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir en mapas' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&origin=20.67,-103.35&destination=20.68,-103.34&travelmode=driving',
    )
    expect(screen.getByText(/^Ruta: OpenRouteService · 14 nov/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitar ruta' })).toBeInTheDocument()
  })

  it('si en carro no hay paso y la función dio la ruta a pie, lo avisa', () => {
    const aPie = {
      ...RESULTADO,
      modo: 'a_pie',
      sinPasoEnCarro: true,
      ruta: { ...RESULTADO.ruta, properties: { modo: 'a_pie' } },
    }
    mostrar({ ruta: ruta({ estado: 'listo', resultado: aPie, origen: ORIGEN }), modo: 'carro' })
    expect(
      screen.getByText('En carro no hay paso a ningún refugio cercano. Esta es la ruta a pie (a pie sí se pasan los bloqueos parciales).'),
    ).toBeInTheDocument()
    expect(screen.getByText('Refugio Escuela Juárez: 12 min a pie · 4.3 km')).toBeInTheDocument()
  })

  describe('ruta combinada (el carro no llega al refugio)', () => {
    const TRANSBORDO = [-103.342, 20.678]
    const COMBINADA = {
      ...RESULTADO,
      modo: 'combinada',
      ruta: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [ORIGEN, TRANSBORDO] }, properties: { modo: 'carro' } },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [TRANSBORDO, [-103.34, 20.68]] }, properties: { modo: 'a_pie' } },
        ],
      },
      transbordo: TRANSBORDO,
      tramos: {
        carro: { distanciaM: 3900, duracionS: 540, pasos: [] },
        aPie: { distanciaM: 420, duracionS: 360, pasos: [] },
        descensoS: 120,
      },
      resumen: {
        distanciaM: 4320,
        duracionS: 1020,
        pasos: [
          { instruccion: 'Sigue por Av. Juárez', distanciaM: 3900 },
          { instruccion: 'Bájate del vehículo aquí y sigue a pie', distanciaM: 0 },
          { instruccion: 'Camina al norte', distanciaM: 420 },
        ],
      },
    }
    const mostrarCombinada = () =>
      mostrar({ ruta: ruta({ estado: 'listo', resultado: COMBINADA, origen: ORIGEN }), modo: 'carro' })

    it('dice el total, que el carro no llega y cada tramo', () => {
      mostrarCombinada()
      expect(screen.getByText('Refugio Escuela Juárez: 17 min en total · 4.3 km')).toBeInTheDocument()
      expect(
        screen.getByText('El carro no puede llegar hasta el refugio: bájate en el punto amarillo y sigue a pie.'),
      ).toBeInTheDocument()
      expect(screen.getByText('En carro (línea morada): 9 min · 3.9 km')).toBeInTheDocument()
      expect(screen.getByText('Bajar del vehículo: 2 min')).toBeInTheDocument()
      expect(screen.getByText('A pie (línea azul): 6 min · 420 m')).toBeInTheDocument()
      expect(screen.getByText('Bájate del vehículo aquí y sigue a pie')).toBeInTheDocument()
    })

    it('un enlace para cada tramo en la app de mapas', () => {
      mostrarCombinada()
      expect(screen.getByRole('link', { name: 'Abrir tramo en carro' })).toHaveAttribute(
        'href',
        enlaceRutaEnMapas(ORIGEN, TRANSBORDO, 'carro'),
      )
      expect(screen.getByRole('link', { name: 'Abrir tramo a pie' })).toHaveAttribute(
        'href',
        enlaceRutaEnMapas(TRANSBORDO, [-103.34, 20.68], 'a_pie'),
      )
      expect(screen.queryByRole('link', { name: 'Abrir en mapas' })).toBeNull()
    })
  })

  it('avisa si la persona está dentro de una zona de peligro', () => {
    mostrar({ ruta: ruta({ estado: 'listo', resultado: { ...RESULTADO, origenEnZona: true }, origen: ORIGEN }) })
    expect(screen.getByRole('alert')).toHaveTextContent('Estás dentro de una zona de peligro')
  })

  it.each([
    ['bloqueada', 'Los bloqueos y las zonas de peligro cierran el paso'],
    ['sin-refugios', 'No hay refugios abiertos a 30 km'],
    ['otro', 'No encontramos una ruta segura'],
  ])('sin ruta (%s) lo dice explícitamente', (motivo, texto) => {
    mostrar({ ruta: ruta({ estado: 'sin-ruta', resultado: { estado: 'sin-ruta', motivo } }) })
    expect(screen.getByRole('alert')).toHaveTextContent(texto)
  })

  it('en carro sin conexión sugiere A pie', () => {
    mostrar({ ruta: ruta({ estado: 'sin-conexion-carro' }), modo: 'carro' })
    expect(screen.getByText(/la ruta en carro necesita internet/)).toBeInTheDocument()
  })

  it('con respaldo muestra el aviso y el panel de la ruta del teléfono, sin su botón', () => {
    mostrar({ ruta: ruta({ estado: 'respaldo', aviso: 'Sin conexión: ruta a pie calculada en tu teléfono.' }) })
    expect(screen.getByText('Sin conexión: ruta a pie calculada en tu teléfono.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ruta de evacuación a pie' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ruta a punto de reunión' })).toBeNull()
  })

  it('los errores terminan con qué hacer', () => {
    mostrar({ ruta: ruta({ estado: 'error', error: 'Ya pediste muchas rutas en la última hora.' }) })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo calcular la ruta: Ya pediste muchas rutas en la última hora. Sigue las indicaciones de Protección Civil.',
    )
  })
})

describe('textos de ruta', () => {
  it('duración, evitados y enlace con lat,lng', () => {
    expect(textoDuracion(30)).toBe('1 min')
    expect(textoDuracion(3900)).toBe('1 h 05 min')
    expect(textoEvitados({ bloqueos: 1, zonas: 0 })).toBe('Evita 1 bloqueo')
    expect(textoEvitados({})).toBeNull()
    expect(enlaceRutaEnMapas([-103.35, 20.67], [-103.34, 20.68], 'a_pie')).toContain('travelmode=walking')
  })
})

describe('useModoRuta', () => {
  it('empieza en A pie y recuerda la elección', () => {
    localStorage.removeItem('modo-ruta')
    const { result } = renderHook(() => useModoRuta())
    expect(result.current[0]).toBe('a_pie')

    act(() => result.current[1]('carro'))
    expect(result.current[0]).toBe('carro')
    expect(renderHook(() => useModoRuta()).result.current[0]).toBe('carro')
  })
})
