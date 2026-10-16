import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import Mapa from './Mapa.jsx'
import { useSismos } from '../hooks/useSismos.js'
import { useCiclones } from '../hooks/useCiclones.js'
import { useSatelite } from '../hooks/useSatelite.js'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'
import { nhcEjemplo, eventosGdacsEjemplo, puntosNhcEjemplo } from '../mocks/ciclonesEjemplo.js'
import { combinarCiclones } from '../utils/ciclones.js'

vi.mock('../hooks/useSismos.js', () => ({ useSismos: vi.fn() }))
vi.mock('../hooks/useCiclones.js', () => ({ useCiclones: vi.fn() }))
vi.mock('../hooks/useSatelite.js', () => ({ useSatelite: vi.fn() }))
// MapLibre necesita WebGL; aquí solo se prueba lo que muestra la página alrededor del mapa
// El MapaBase falso guarda sus props para poder simular que el mapa base falla
const { mapaBase, capas } = vi.hoisted(() => ({ mapaBase: { props: null, montajes: 0 }, capas: {} }))
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
// Las capas falsas guardan sus props para comprobar qué les pasa la página
vi.mock('../components/CapaSismos.jsx', () => ({ default: (props) => ((capas.sismos = props), null) }))
vi.mock('../components/CapaCiclones.jsx', () => ({ default: (props) => ((capas.ciclones = props), null) }))
vi.mock('../components/CapaSatelite.jsx', () => ({ default: (props) => ((capas.satelite = props), null) }))

const AVISO =
  'Plataforma informativa. Las indicaciones oficiales de Protección Civil, SMN y SSN tienen prioridad.'
// 1700000000000 en hora de CDMX
const HORA = /14 nov\.? 2023, 16:13/

const dosSismos = { ...sismosEjemplo, features: sismosEjemplo.features.slice(0, 2) }
const unSismo = { ...sismosEjemplo, features: sismosEjemplo.features.slice(0, 1) }
const sinSismos = { ...sismosEjemplo, features: [] }
const VACIA = { type: 'FeatureCollection', features: [] }

function estadoFuente(valores = {}) {
  return {
    datos: null,
    estado: 'cargando',
    error: null,
    actualizadoEn: null,
    sinConexion: false,
    recargar: vi.fn(),
    ...valores,
  }
}

function simularSismos(valores = {}) {
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

// Por defecto: NHC con Trudy y GDACS con Simon y Trudy, ambos listos
function simularCiclones({ nhc = {}, gdacs = {} } = {}) {
  const estadoNhc = estadoFuente({ estado: 'listo', datos: nhcEjemplo, actualizadoEn: 1792184930000, ...nhc })
  const estadoGdacs = estadoFuente({
    estado: 'listo',
    datos: eventosGdacsEjemplo,
    actualizadoEn: Date.UTC(2026, 9, 16, 21, 10),
    ...gdacs,
  })
  useCiclones.mockReturnValue({
    nhc: estadoNhc,
    gdacs: estadoGdacs,
    ciclones: combinarCiclones(estadoNhc.datos?.puntos ?? null, estadoGdacs.datos),
    eventosGdacsSinNhc: VACIA,
  })
  return { nhc: estadoNhc, gdacs: estadoGdacs }
}

function simularSatelite(valores = {}) {
  useSatelite.mockReturnValue(estadoFuente(valores))
}

describe('Página Mapa', () => {
  beforeEach(() => {
    useSismos.mockReset()
    useCiclones.mockReset()
    useSatelite.mockReset()
    mapaBase.props = null
    mapaBase.montajes = 0
    simularSismos({ estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 })
    simularCiclones()
    simularSatelite()
  })

  it('muestra el título Mapa en vivo', () => {
    render(<Mapa />)
    expect(screen.getByRole('heading', { name: 'Mapa en vivo' })).toBeInTheDocument()
  })

  it('muestra el aviso informativo en todos los estados', () => {
    const estados = [
      {},
      { estado: 'error', error: 'USGS respondió 503' },
      { estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 },
      { sinConexion: true },
    ]
    for (const valores of estados) {
      simularSismos(valores)
      const { unmount } = render(<Mapa />)
      expect(screen.getByText(AVISO)).toBeInTheDocument()
      unmount()
    }
  })

  describe('sismos', () => {
    it('muestra Cargando los sismos… al inicio', () => {
      simularSismos({})
      render(<Mapa />)
      expect(screen.getByText('Cargando los sismos…')).toBeInTheDocument()
    })

    it('muestra el error real y Reintentar llama recargar', () => {
      const recargar = simularSismos({ estado: 'error', error: 'USGS respondió 503' })
      render(<Mapa />)

      expect(screen.getByText('No se pudieron cargar los sismos: USGS respondió 503')).toBeInTheDocument()
      screen.getByRole('button', { name: 'Reintentar' }).click()
      expect(recargar).toHaveBeenCalledTimes(1)
    })

    it('con error y datos previos mantiene el mapa y avisa', () => {
      simularSismos({ estado: 'error', error: 'USGS respondió 500', sismos: dosSismos, actualizadoEn: 1700000000000 })
      render(<Mapa />)

      expect(screen.getByText(/^No se pudieron actualizar los sismos\. Mostrando datos del /)).toHaveTextContent(HORA)
      expect(screen.getByText('2 sismos en los últimos 7 días')).toBeInTheDocument()
      expect(screen.getByTestId('mapa')).toBeInTheDocument()
    })

    it('al reintentar con datos en pantalla muestra Actualizando los sismos…', () => {
      simularSismos({ estado: 'cargando', sismos: dosSismos, actualizadoEn: 1700000000000 })
      render(<Mapa />)
      expect(screen.getByText('Actualizando los sismos…')).toBeInTheDocument()
    })

    it('muestra el mensaje de semana sin sismos', () => {
      simularSismos({ estado: 'listo', sismos: sinSismos, actualizadoEn: 1700000000000 })
      render(<Mapa />)
      expect(
        screen.getByText('No hay sismos de magnitud 2.5 o más en México y alrededores en los últimos 7 días.'),
      ).toBeInTheDocument()
    })

    it('muestra el conteo en singular y plural', () => {
      simularSismos({ estado: 'listo', sismos: unSismo, actualizadoEn: 1700000000000 })
      const { unmount } = render(<Mapa />)
      expect(screen.getByText('1 sismo en los últimos 7 días')).toBeInTheDocument()
      unmount()

      simularSismos({ estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 })
      render(<Mapa />)
      expect(screen.getByText('2 sismos en los últimos 7 días')).toBeInTheDocument()
    })

    it('muestra la leyenda de magnitudes', () => {
      render(<Mapa />)
      expect(screen.getByText('6.0 o más')).toBeInTheDocument()
      expect(screen.getByText('4.0 a 5.9')).toBeInTheDocument()
      expect(screen.getByText('menos de 4.0')).toBeInTheDocument()
    })
  })

  describe('ciclones', () => {
    it('lista Huracán Trudy con categoría, viento y alerta de GDACS', () => {
      render(<Mapa />)
      expect(screen.getByText('Huracán Trudy · categoría 1 · 139 km/h · alerta GDACS naranja')).toBeInTheDocument()
      expect(screen.getByText('Ciclón tropical Simon · alerta GDACS verde')).toBeInTheDocument()
    })

    it('nunca dice "Sin ciclones activos" si NOAA falló', () => {
      simularCiclones({
        nhc: { estado: 'error', error: 'Formato inesperado de NOAA', datos: null, actualizadoEn: null },
        gdacs: { datos: VACIA },
      })
      render(<Mapa />)

      expect(screen.queryByText(/Sin ciclones activos/)).not.toBeInTheDocument()
      expect(
        screen.getByText('No se pudieron cargar los ciclones de NHC: Formato inesperado de NOAA'),
      ).toBeInTheDocument()
    })

    it('mientras una fuente carga tampoco dice "Sin ciclones activos"', () => {
      simularCiclones({ nhc: { estado: 'cargando', datos: null }, gdacs: { datos: VACIA } })
      render(<Mapa />)
      expect(screen.queryByText(/Sin ciclones activos/)).not.toBeInTheDocument()
    })

    it('dice "Sin ciclones activos" solo si las dos fuentes respondieron vacías', () => {
      simularCiclones({
        nhc: { datos: { puntos: VACIA, trayectorias: VACIA, conos: VACIA, avisos: VACIA } },
        gdacs: { datos: VACIA },
      })
      render(<Mapa />)
      expect(screen.getByText('Sin ciclones activos cerca de México según NHC y GDACS.')).toBeInTheDocument()
    })

    it('si GDACS falla igual lista los ciclones de NHC', () => {
      simularCiclones({ gdacs: { estado: 'error', error: 'No se pudo conectar con GDACS', datos: null } })
      render(<Mapa />)

      expect(screen.getByText('Huracán Trudy · categoría 1 · 139 km/h')).toBeInTheDocument()
      expect(
        screen.getByText('No se pudieron cargar los ciclones de GDACS: No se pudo conectar con GDACS'),
      ).toBeInTheDocument()
    })

    it('le pasa a CapaCiclones los datos de NHC y los eventos que solo tiene GDACS', () => {
      render(<Mapa />)
      expect(capas.ciclones.nhc).toBe(nhcEjemplo)
      expect(capas.ciclones.eventosGdacs).toEqual(VACIA)
      expect(puntosNhcEjemplo.features).toHaveLength(2)
    })
  })

  describe('capas y satélite', () => {
    it('el satélite empieza apagado y no se le pide la hora', () => {
      render(<Mapa />)
      expect(useSatelite).toHaveBeenLastCalledWith(false)
      expect(capas.satelite.visible).toBe(false)
    })

    it('al prender Satélite se pide la hora y se muestra la capa', () => {
      simularSatelite({ estado: 'listo', datos: '2026-10-16T21:30:00Z', actualizadoEn: Date.UTC(2026, 9, 16, 21, 30) })
      render(<Mapa />)

      act(() => {
        screen.getByRole('checkbox', { name: 'Satélite' }).click()
      })
      expect(useSatelite).toHaveBeenLastCalledWith(true)
      expect(capas.satelite).toMatchObject({ visible: true, hora: '2026-10-16T21:30:00Z' })
    })

    it('apagar Sismos y Ciclones oculta sus capas', () => {
      render(<Mapa />)
      act(() => {
        screen.getByRole('checkbox', { name: 'Sismos' }).click()
        screen.getByRole('checkbox', { name: 'Ciclones' }).click()
      })
      expect(capas.sismos.visible).toBe(false)
      expect(capas.ciclones.visible).toBe(false)
    })

    it('el mensaje de satélite solo aparece con la capa prendida', () => {
      simularSatelite({ estado: 'error', error: 'No se pudo conectar con NASA GIBS' })
      render(<Mapa />)
      expect(screen.queryByText(/imagen de satélite/)).not.toBeInTheDocument()

      act(() => {
        screen.getByRole('checkbox', { name: 'Satélite' }).click()
      })
      expect(
        screen.getByText('No se pudo cargar la imagen de satélite: No se pudo conectar con NASA GIBS'),
      ).toBeInTheDocument()
    })
  })

  describe('conexión', () => {
    it('sin conexión se avisa una sola vez y se ocultan los mensajes por fuente', () => {
      simularSismos({ estado: 'error', error: 'No se pudo conectar con USGS', sinConexion: true, sismos: dosSismos, actualizadoEn: 1700000000000 })
      simularCiclones({ nhc: { sinConexion: true }, gdacs: { sinConexion: true } })
      render(<Mapa />)

      expect(screen.getAllByText('Sin conexión. Se muestran los últimos datos descargados.')).toHaveLength(1)
      expect(screen.queryByText(/No se pudieron/)).not.toBeInTheDocument()
    })

    it('sin conexión y sin datos lo dice claramente', () => {
      simularSismos({ sinConexion: true })
      simularCiclones({ nhc: { estado: 'cargando', datos: null }, gdacs: { estado: 'cargando', datos: null } })
      render(<Mapa />)
      expect(screen.getByText('Sin conexión. No hay datos guardados.')).toBeInTheDocument()
      expect(screen.queryByText('Cargando los sismos…')).not.toBeInTheDocument()
    })
  })

  describe('pie', () => {
    it('muestra la fuente y la hora de cada dato', () => {
      render(<Mapa />)
      expect(screen.getByText(/^Sismos: USGS · /)).toHaveTextContent(HORA)
      // 1792184930000 = 16 oct 2026 15:08 en CDMX; GDACS 21:10 UTC = 15:10 en CDMX
      expect(screen.getByText(/^Ciclones: NHC\/NOAA · /)).toHaveTextContent(
        /NHC\/NOAA · 16 oct\.? 2026, 15:08 · GDACS · 16 oct\.? 2026, 15:10/,
      )
      expect(screen.queryByText(/^Satélite:/)).not.toBeInTheDocument()
    })

    it('sin datos todavía usa — en lugar de "sin fecha"', () => {
      simularSismos({})
      render(<Mapa />)
      expect(screen.getByText('Sismos: USGS · —')).toBeInTheDocument()
      expect(screen.queryByText(/sin fecha/)).not.toBeInTheDocument()
    })

    it('con el satélite prendido también muestra su hora', () => {
      simularSatelite({ estado: 'listo', datos: '2026-10-16T21:30:00Z', actualizadoEn: Date.UTC(2026, 9, 16, 21, 30) })
      render(<Mapa />)
      act(() => {
        screen.getByRole('checkbox', { name: 'Satélite' }).click()
      })
      expect(screen.getByText(/^Satélite: NASA GIBS \(GOES-East\) · /)).toHaveTextContent(/16 oct\.? 2026, 15:30/)
    })

    it('muestra la leyenda de ciclones', () => {
      render(<Mapa />)
      expect(screen.getByText('Cono de pronóstico')).toBeInTheDocument()
      expect(screen.getByText('Aviso de huracán')).toBeInTheDocument()
      expect(screen.getByText('Alerta GDACS roja')).toBeInTheDocument()
    })
  })

  it('si el mapa base no carga, lo dice y Reintentar vuelve a crearlo', () => {
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
