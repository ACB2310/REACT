import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import Mapa from './Mapa.jsx'
import { useSismos } from '../hooks/useSismos.js'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'

vi.mock('../hooks/useSismos.js', () => ({ useSismos: vi.fn() }))
// MapLibre necesita WebGL; aquí solo se prueba lo que muestra la página alrededor del mapa
// El MapaBase falso guarda sus props para poder simular que el mapa base falla
const { mapaBase } = vi.hoisted(() => ({ mapaBase: { props: null, montajes: 0 } }))
vi.mock('../components/MapaBase.jsx', async () => {
  const { useEffect } = await import('react')
  return {
    default: function MapaBaseFalso(props) {
      mapaBase.props = props
      useEffect(() => {
        mapaBase.montajes += 1
      }, [])
      return <div data-testid="mapa" />
    },
  }
})
vi.mock('../components/CapaSismos.jsx', () => ({ default: () => null }))

const AVISO =
  'Plataforma informativa. Las indicaciones oficiales de Protección Civil, SMN y SSN tienen prioridad.'
// 1700000000000 en hora de CDMX
const HORA = /14 nov\.? 2023, 16:13/

const dosSismos = { ...sismosEjemplo, features: sismosEjemplo.features.slice(0, 2) }
const unSismo = { ...sismosEjemplo, features: sismosEjemplo.features.slice(0, 1) }
const sinSismos = { ...sismosEjemplo, features: [] }

function simularHook(valores) {
  const recargar = vi.fn()
  useSismos.mockReturnValue({
    sismos: null,
    estado: 'cargando',
    error: null,
    actualizadoEn: null,
    sinConexion: false,
    recargar,
    ...valores,
  })
  return recargar
}

describe('Página Mapa', () => {
  beforeEach(() => {
    useSismos.mockReset()
    mapaBase.props = null
    mapaBase.montajes = 0
  })

  it('muestra el aviso informativo en todos los estados', () => {
    const estados = [
      {},
      { estado: 'error', error: 'USGS respondió 503' },
      { estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 },
      { sinConexion: true },
    ]
    for (const valores of estados) {
      simularHook(valores)
      const { unmount } = render(<Mapa />)
      expect(screen.getByText(AVISO)).toBeInTheDocument()
      unmount()
    }
  })

  it('muestra Cargando sismos… al inicio', () => {
    simularHook({})
    render(<Mapa />)
    expect(screen.getByText('Cargando sismos…')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sismos recientes' })).toBeInTheDocument()
  })

  it('muestra el error real y Reintentar llama recargar', () => {
    const recargar = simularHook({ estado: 'error', error: 'USGS respondió 503' })
    render(<Mapa />)

    expect(screen.getByText('No se pudieron cargar los sismos: USGS respondió 503')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Reintentar' }).click()
    expect(recargar).toHaveBeenCalledTimes(1)
  })

  it('con error y datos previos mantiene el mapa y avisa', () => {
    simularHook({ estado: 'error', error: 'USGS respondió 500', sismos: dosSismos, actualizadoEn: 1700000000000 })
    render(<Mapa />)

    expect(screen.getByText(/^No se pudo actualizar\. Mostrando datos del /)).toHaveTextContent(HORA)
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.getByText('2 sismos en los últimos 7 días')).toBeInTheDocument()
    expect(screen.getByTestId('mapa')).toBeInTheDocument()
  })

  it('sin conexión muestra la hora de los últimos datos', () => {
    simularHook({ estado: 'listo', sinConexion: true, sismos: dosSismos, actualizadoEn: 1700000000000 })
    render(<Mapa />)
    expect(screen.getByText(/^Sin conexión\. Mostrando datos del /)).toHaveTextContent(HORA)
  })

  it('sin conexión y sin datos lo dice claramente', () => {
    simularHook({ sinConexion: true })
    render(<Mapa />)
    expect(screen.getByText('Sin conexión. No hay datos guardados.')).toBeInTheDocument()
    expect(screen.queryByText('Cargando sismos…')).not.toBeInTheDocument()
  })

  it('muestra el mensaje de semana sin sismos', () => {
    simularHook({ estado: 'listo', sismos: sinSismos, actualizadoEn: 1700000000000 })
    render(<Mapa />)
    expect(
      screen.getByText('No hay sismos de magnitud 2.5 o más en México y alrededores en los últimos 7 días.'),
    ).toBeInTheDocument()
  })

  it('muestra el conteo en singular y plural', () => {
    simularHook({ estado: 'listo', sismos: unSismo, actualizadoEn: 1700000000000 })
    const { unmount } = render(<Mapa />)
    expect(screen.getByText('1 sismo en los últimos 7 días')).toBeInTheDocument()
    unmount()

    simularHook({ estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 })
    render(<Mapa />)
    expect(screen.getByText('2 sismos en los últimos 7 días')).toBeInTheDocument()
  })

  it('muestra Fuente: USGS y la hora de actualización', () => {
    simularHook({ estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 })
    render(<Mapa />)
    expect(screen.getByText(/^Fuente: USGS · Actualizado: /)).toHaveTextContent(HORA)
  })

  it('al reintentar con datos en pantalla muestra Actualizando…', () => {
    simularHook({ estado: 'cargando', sismos: dosSismos, actualizadoEn: 1700000000000 })
    render(<Mapa />)
    expect(screen.getByText('Actualizando…')).toBeInTheDocument()
  })

  it('sin datos todavía el pie no dice "sin fecha"', () => {
    simularHook({})
    render(<Mapa />)
    expect(screen.getByText('Fuente: USGS · Actualizado: —')).toBeInTheDocument()
    expect(screen.queryByText(/sin fecha/)).not.toBeInTheDocument()
  })

  it('muestra la leyenda de magnitudes', () => {
    simularHook({ estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 })
    render(<Mapa />)
    expect(screen.getByText('6.0 o más')).toBeInTheDocument()
    expect(screen.getByText('4.0 a 5.9')).toBeInTheDocument()
    expect(screen.getByText('menos de 4.0')).toBeInTheDocument()
  })

  it('si el mapa base no carga, lo dice y Reintentar vuelve a crearlo', () => {
    simularHook({ estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 })
    render(<Mapa />)
    expect(mapaBase.montajes).toBe(1)

    act(() => {
      mapaBase.props.alFallar()
    })
    expect(screen.getByText('No se pudo cargar el mapa base. Revisa tu conexión.')).toBeInTheDocument()
    expect(screen.getByText('2 sismos en los últimos 7 días')).toBeInTheDocument()

    act(() => {
      screen.getByRole('button', { name: 'Reintentar mapa' }).click()
    })
    expect(mapaBase.montajes).toBe(2)
    expect(screen.queryByText('No se pudo cargar el mapa base. Revisa tu conexión.')).not.toBeInTheDocument()
  })
})
