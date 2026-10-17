import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Mapa from './Mapa.jsx'
import { useSismos } from '../hooks/useSismos.js'
import { useCiclones } from '../hooks/useCiclones.js'
import { useSatelite } from '../hooks/useSatelite.js'
import { useRefugios } from '../hooks/useRefugios.js'
import { useBloqueos } from '../hooks/useBloqueos.js'
import { useSesion } from '../hooks/useSesion.js'
import { useIncidentes } from '../hooks/useBrigadas.js'
import { useRutaEvacuacion } from '../hooks/useRutaEvacuacion.js'
import { simularSupabaseListo } from '../test/simularSupabase.js'
import { renovarBloqueo, eliminarBloqueo } from '../services/bloqueos.js'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'
import { nhcEjemplo, eventosGdacsEjemplo, puntosNhcEjemplo } from '../mocks/ciclonesEjemplo.js'
import { combinarCiclones } from '../utils/ciclones.js'

vi.mock('../hooks/useSismos.js', () => ({ useSismos: vi.fn() }))
vi.mock('../hooks/useCiclones.js', () => ({ useCiclones: vi.fn() }))
vi.mock('../hooks/useSatelite.js', () => ({ useSatelite: vi.fn() }))
// Refugios, bloqueos y sesión salen de Supabase: aquí se simulan
vi.mock('../hooks/useRefugios.js', () => ({ useRefugios: vi.fn() }))
vi.mock('../hooks/useBloqueos.js', () => ({ useBloqueos: vi.fn() }))
vi.mock('../hooks/useSesion.js', () => ({ useSesion: vi.fn() }))
vi.mock('../services/bloqueos.js', () => ({ renovarBloqueo: vi.fn(), eliminarBloqueo: vi.fn(), confirmarBloqueo: vi.fn() }))
// La ruta de evacuación se simula: sus reglas se prueban en useRutaEvacuacion.test.js
vi.mock('../hooks/useRutaEvacuacion.js', () => ({ useRutaEvacuacion: vi.fn() }))
// MapLibre necesita WebGL; aquí solo se prueba lo que muestra la página alrededor del mapa
// El MapaBase falso guarda sus props para poder simular que el mapa base falla
const { mapaBase, capas, ordenRender } = vi.hoisted(() => ({
  mapaBase: { props: null, montajes: 0 },
  capas: {},
  // En qué orden se dibujan las capas (la ruta debe ir al final para quedar encima)
  ordenRender: [],
}))
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
vi.mock('../components/CapaRefugios.jsx', () => ({ default: (props) => ((capas.refugios = props), null) }))
vi.mock('../components/CapaBloqueos.jsx', () => ({
  default: (props) => ((capas.bloqueos = props), ordenRender.push('bloqueos'), null),
}))
vi.mock('../components/CapaIncidentes.jsx', () => ({ default: (props) => ((capas.incidentes = props), null) }))
vi.mock('../hooks/useBrigadas.js', () => ({
  useIncidentes: vi.fn(() => ({ incidentes: null, estado: 'listo', recargar: () => {} })),
}))
vi.mock('../components/CapaRutasEvacuacion.jsx', () => ({
  default: (props) => ((capas.ruta = props), ordenRender.push('ruta'), null),
}))

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

const RUTA = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[-100.31, 25.67], [-100.3, 25.67]] },
  properties: { refugioId: '3', distanciaM: 1040, nivelRiesgo: 'bajo' },
}

function simularEvacuacion(valores = {}) {
  const valor = {
    estado: 'inactivo',
    error: null,
    motivo: null,
    resultado: null,
    zona: null,
    origen: null,
    precisionM: null,
    ubicadoEn: null,
    sinDatosSismos: false,
    bloqueosSinConfirmarCerca: 0,
    buscarRuta: vi.fn(),
    limpiar: vi.fn(),
    ...valores,
  }
  useRutaEvacuacion.mockReturnValue(valor)
  return valor
}

function conRuta(extra = {}) {
  return simularEvacuacion({
    estado: 'listo',
    origen: [-100.3099, 25.6701],
    zona: { descargadoEn: Date.UTC(2026, 9, 16, 22) },
    ubicadoEn: Date.UTC(2026, 9, 16, 22, 5),
    resultado: {
      estado: 'ok',
      distanciaM: 1040,
      nivelRiesgo: 'bajo',
      ruta: RUTA,
      puntoReunion: { nombre: 'Plaza Hidalgo', coordenadas: [-100.3001, 25.6702], tipo: 'punto-reunion' },
    },
    ...extra,
  })
}

describe('Página Mapa', () => {
  beforeEach(() => {
    simularSupabaseListo({ useRefugios, useBloqueos, useSesion })
    useSismos.mockReset()
    useCiclones.mockReset()
    useSatelite.mockReset()
    mapaBase.props = null
    mapaBase.montajes = 0
    simularSismos({ estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 })
    simularCiclones()
    simularSatelite()
    simularEvacuacion()
    ordenRender.length = 0
  })

  it('muestra el título Mapa en vivo', () => {
    render(<Mapa />, { wrapper: MemoryRouter })
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
      const { unmount } = render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText(AVISO)).toBeInTheDocument()
      unmount()
    }
  })

  describe('sismos', () => {
    it('muestra Cargando los sismos… al inicio', () => {
      simularSismos({})
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('Cargando los sismos…')).toBeInTheDocument()
    })

    it('muestra el error real y Reintentar llama recargar', () => {
      const recargar = simularSismos({ estado: 'error', error: 'USGS respondió 503' })
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(screen.getByText('No se pudieron cargar los sismos: USGS respondió 503')).toBeInTheDocument()
      screen.getByRole('button', { name: 'Reintentar' }).click()
      expect(recargar).toHaveBeenCalledTimes(1)
    })

    it('con error y datos previos mantiene el mapa y avisa', () => {
      simularSismos({ estado: 'error', error: 'USGS respondió 500', sismos: dosSismos, actualizadoEn: 1700000000000 })
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(screen.getByText(/^No se pudieron actualizar los sismos\. Mostrando datos del /)).toHaveTextContent(HORA)
      expect(screen.getByText('2 sismos en los últimos 7 días')).toBeInTheDocument()
      expect(screen.getByTestId('mapa')).toBeInTheDocument()
    })

    it('al reintentar con datos en pantalla muestra Actualizando los sismos…', () => {
      simularSismos({ estado: 'cargando', sismos: dosSismos, actualizadoEn: 1700000000000 })
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('Actualizando los sismos…')).toBeInTheDocument()
    })

    it('muestra el mensaje de semana sin sismos', () => {
      simularSismos({ estado: 'listo', sismos: sinSismos, actualizadoEn: 1700000000000 })
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(
        screen.getByText('No hay sismos de magnitud 2.5 o más en México y alrededores en los últimos 7 días.'),
      ).toBeInTheDocument()
    })

    it('muestra el conteo en singular y plural', () => {
      simularSismos({ estado: 'listo', sismos: unSismo, actualizadoEn: 1700000000000 })
      const { unmount } = render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('1 sismo en los últimos 7 días')).toBeInTheDocument()
      unmount()

      simularSismos({ estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 })
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('2 sismos en los últimos 7 días')).toBeInTheDocument()
    })

    it('muestra la leyenda de magnitudes', () => {
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('6.0 o más')).toBeInTheDocument()
      expect(screen.getByText('4.0 a 5.9')).toBeInTheDocument()
      expect(screen.getByText('menos de 4.0')).toBeInTheDocument()
    })
  })

  describe('ciclones', () => {
    it('lista Huracán Trudy con categoría, viento y alerta de GDACS', () => {
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('Huracán Trudy · categoría 1 · 139 km/h · alerta GDACS naranja')).toBeInTheDocument()
      expect(screen.getByText('Ciclón tropical Simon · alerta GDACS verde')).toBeInTheDocument()
    })

    it('nunca dice "Sin ciclones activos" si NOAA falló', () => {
      simularCiclones({
        nhc: { estado: 'error', error: 'Formato inesperado de NOAA', datos: null, actualizadoEn: null },
        gdacs: { datos: VACIA },
      })
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(screen.queryByText(/Sin ciclones activos/)).not.toBeInTheDocument()
      expect(
        screen.getByText('No se pudieron cargar los ciclones de NHC: Formato inesperado de NOAA'),
      ).toBeInTheDocument()
    })

    it('mientras una fuente carga tampoco dice "Sin ciclones activos"', () => {
      simularCiclones({ nhc: { estado: 'cargando', datos: null }, gdacs: { datos: VACIA } })
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.queryByText(/Sin ciclones activos/)).not.toBeInTheDocument()
    })

    it('dice "Sin ciclones activos" solo si las dos fuentes respondieron vacías', () => {
      simularCiclones({
        nhc: { datos: { puntos: VACIA, trayectorias: VACIA, conos: VACIA, avisos: VACIA } },
        gdacs: { datos: VACIA },
      })
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('Sin ciclones activos cerca de México según NHC y GDACS.')).toBeInTheDocument()
    })

    it('si GDACS falla igual lista los ciclones de NHC', () => {
      simularCiclones({ gdacs: { estado: 'error', error: 'No se pudo conectar con GDACS', datos: null } })
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(screen.getByText('Huracán Trudy · categoría 1 · 139 km/h')).toBeInTheDocument()
      expect(
        screen.getByText('No se pudieron cargar los ciclones de GDACS: No se pudo conectar con GDACS'),
      ).toBeInTheDocument()
    })

    it('le pasa a CapaCiclones los datos de NHC y los eventos que solo tiene GDACS', () => {
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(capas.ciclones.nhc).toBe(nhcEjemplo)
      expect(capas.ciclones.eventosGdacs).toEqual(VACIA)
      expect(puntosNhcEjemplo.features).toHaveLength(2)
    })
  })

  describe('capas y satélite', () => {
    it('el satélite empieza apagado y no se le pide la hora', () => {
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(useSatelite).toHaveBeenLastCalledWith(false)
      expect(capas.satelite.visible).toBe(false)
    })

    it('al prender Satélite se pide la hora y se muestra la capa', () => {
      simularSatelite({ estado: 'listo', datos: '2026-10-16T21:30:00Z', actualizadoEn: Date.UTC(2026, 9, 16, 21, 30) })
      render(<Mapa />, { wrapper: MemoryRouter })

      act(() => {
        screen.getByRole('checkbox', { name: 'Satélite' }).click()
      })
      expect(useSatelite).toHaveBeenLastCalledWith(true)
      expect(capas.satelite).toMatchObject({ visible: true, hora: '2026-10-16T21:30:00Z' })
    })

    it('apagar Sismos y Ciclones oculta sus capas', () => {
      render(<Mapa />, { wrapper: MemoryRouter })
      act(() => {
        screen.getByRole('checkbox', { name: 'Sismos' }).click()
        screen.getByRole('checkbox', { name: 'Ciclones' }).click()
      })
      expect(capas.sismos.visible).toBe(false)
      expect(capas.ciclones.visible).toBe(false)
    })

    it('el mensaje de satélite solo aparece con la capa prendida', () => {
      simularSatelite({ estado: 'error', error: 'No se pudo conectar con NASA GIBS' })
      render(<Mapa />, { wrapper: MemoryRouter })
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
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(screen.getAllByText('Sin conexión. Se muestran los últimos datos descargados.')).toHaveLength(1)
      expect(screen.queryByText(/No se pudieron/)).not.toBeInTheDocument()
    })

    it('sin conexión y sin datos lo dice claramente', () => {
      simularSismos({ sinConexion: true })
      simularCiclones({ nhc: { estado: 'cargando', datos: null }, gdacs: { estado: 'cargando', datos: null } })
      simularSupabaseListo(
        { useRefugios, useBloqueos, useSesion },
        { refugios: { estado: 'cargando', refugios: null }, bloqueos: { estado: 'cargando', bloqueos: null } },
      )
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('Sin conexión. No hay datos guardados.')).toBeInTheDocument()
      expect(screen.queryByText('Cargando los sismos…')).not.toBeInTheDocument()
    })
  })

  describe('pie', () => {
    it('muestra la fuente y la hora de cada dato', () => {
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText(/^Sismos: USGS · /)).toHaveTextContent(HORA)
      // 1792184930000 = 16 oct 2026 15:08 en CDMX; GDACS 21:10 UTC = 15:10 en CDMX
      expect(screen.getByText(/^Ciclones: NHC\/NOAA · /)).toHaveTextContent(
        /NHC\/NOAA · 16 oct\.? 2026, 15:08 · GDACS · 16 oct\.? 2026, 15:10/,
      )
      expect(screen.queryByText(/^Satélite:/)).not.toBeInTheDocument()
    })

    it('sin tormentas el pie dice cuándo se consultó en lugar de —', () => {
      const vacioNhc = { puntos: VACIA, trayectorias: VACIA, conos: VACIA, avisos: VACIA }
      simularCiclones({
        nhc: { datos: vacioNhc, actualizadoEn: null, consultadoEn: Date.UTC(2026, 9, 16, 21, 30) },
        gdacs: { datos: VACIA, actualizadoEn: null, consultadoEn: Date.UTC(2026, 9, 16, 21, 31) },
      })
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(screen.getByText(/^Ciclones: NHC\/NOAA · /)).toHaveTextContent(
        /NHC\/NOAA · consultado 16 oct\.? 2026, 15:30 · GDACS · consultado 16 oct\.? 2026, 15:31/,
      )
    })

    it('sin datos todavía usa — en lugar de "sin fecha"', () => {
      simularSismos({})
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('Sismos: USGS · —')).toBeInTheDocument()
      expect(screen.queryByText(/sin fecha/)).not.toBeInTheDocument()
    })

    it('con el satélite prendido también muestra su hora', () => {
      simularSatelite({ estado: 'listo', datos: '2026-10-16T21:30:00Z', actualizadoEn: Date.UTC(2026, 9, 16, 21, 30) })
      render(<Mapa />, { wrapper: MemoryRouter })
      act(() => {
        screen.getByRole('checkbox', { name: 'Satélite' }).click()
      })
      expect(screen.getByText(/^Satélite: NASA GIBS \(GOES-East\) · /)).toHaveTextContent(/16 oct\.? 2026, 15:30/)
    })

    it('muestra la leyenda de ciclones', () => {
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('Cono de pronóstico')).toBeInTheDocument()
      expect(screen.getByText('Aviso de huracán')).toBeInTheDocument()
      expect(screen.getByText('Alerta GDACS roja')).toBeInTheDocument()
    })
  })

  it('si el mapa base no carga, lo dice y Reintentar vuelve a crearlo', () => {
    render(<Mapa />, { wrapper: MemoryRouter })
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

  describe('refugios y bloqueos', () => {
    const BLOQUEO = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-103.35, 20.67] },
      properties: { id: 10, tipo: 'total', esMio: true },
    }

    it('sin Supabase el mapa sigue mostrando sismos y avisa una sola vez', () => {
      simularSupabaseListo(
        { useRefugios, useBloqueos, useSesion },
        {
          refugios: { estado: 'error', error: 'Supabase no está configurado', refugios: null },
          bloqueos: { estado: 'error', error: 'Supabase no está configurado', bloqueos: null },
          sesion: { configurado: false },
        },
      )
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(screen.getByText('2 sismos en los últimos 7 días')).toBeInTheDocument()
      expect(screen.getAllByText('Refugios y bloqueos no disponibles: falta configurar Supabase.')).toHaveLength(1)
      expect(screen.queryByText(/No se pudieron cargar los refugios/)).toBeNull()
      expect(capas.sismos.sismos).toBe(dosSismos)
    })

    it('pasa refugios, bloqueos y rol a sus capas', () => {
      const bloqueos = { type: 'FeatureCollection', features: [BLOQUEO] }
      simularSupabaseListo({ useRefugios, useBloqueos, useSesion }, { bloqueos: { bloqueos }, sesion: { rol: 'brigadista' } })
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(capas.bloqueos.bloqueos).toBe(bloqueos)
      expect(capas.bloqueos.rol).toBe('brigadista')
      expect(capas.bloqueos.visible).toBe(true)
      expect(capas.refugios.visible).toBe(true)
      expect(screen.getByText('1 bloqueo reportado en las últimas 24 h')).toBeInTheDocument()
    })

    it('renovar desde el popup recarga los bloqueos', async () => {
      const recargar = vi.fn()
      simularSupabaseListo({ useRefugios, useBloqueos, useSesion }, { bloqueos: { recargar } })
      renovarBloqueo.mockResolvedValue(Date.now())
      render(<Mapa />, { wrapper: MemoryRouter })

      await act(() => capas.bloqueos.alRenovar(10))

      expect(renovarBloqueo).toHaveBeenCalledWith(10)
      expect(recargar).toHaveBeenCalledWith({ silencioso: true })
    })

    it('un error al eliminar llega al popup', async () => {
      simularSupabaseListo({ useRefugios, useBloqueos, useSesion })
      eliminarBloqueo.mockRejectedValue(new Error('No tienes permiso para hacer esto.'))
      render(<Mapa />, { wrapper: MemoryRouter })

      await expect(capas.bloqueos.alEliminar(10)).rejects.toThrow('No tienes permiso para hacer esto.')
    })

    it('el error de bloqueos se muestra con Reintentar', () => {
      simularSupabaseListo(
        { useRefugios, useBloqueos, useSesion },
        { bloqueos: { estado: 'error', error: 'No se pudo conectar con Supabase', bloqueos: null } },
      )
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(screen.getByText('No se pudieron cargar los bloqueos: No se pudo conectar con Supabase')).toBeInTheDocument()
    })

    it('el pie dice la fuente de los refugios y de los bloqueos', () => {
      const refugios = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: null, properties: { fuente: 'Protección Civil de Jalisco' } }],
      }
      simularSupabaseListo(
        { useRefugios, useBloqueos, useSesion },
        { refugios: { refugios, actualizadoEn: 1700000000000 }, bloqueos: { actualizadoEn: 1700000000000 } },
      )
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(screen.getByText(/^Refugios: Protección Civil de Jalisco · 14 nov/)).toBeInTheDocument()
      expect(screen.getByText(/^Bloqueos: reportes ciudadanos · 14 nov/)).toBeInTheDocument()
    })

    it('tiene un botón para reportar un bloqueo', () => {
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByRole('link', { name: 'Reportar bloqueo' })).toHaveAttribute('href', '/reportar')
    })
  })

  describe('ruta de evacuación', () => {
    it('muestra el botón Ruta a punto de reunión', () => {
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByRole('button', { name: 'Ruta a punto de reunión' })).toBeInTheDocument()
    })

    it('le pasa a la ruta los sismos, los bloqueos y los refugios del mapa', () => {
      const bloqueo = { type: 'Feature', geometry: { type: 'Point', coordinates: [-103.35, 20.67] }, properties: { tipo: 'total' } }
      const refugios = { type: 'FeatureCollection', features: [] }
      simularSupabaseListo(
        { useRefugios, useBloqueos, useSesion },
        { bloqueos: { bloqueos: { type: 'FeatureCollection', features: [bloqueo] } }, refugios: { refugios } },
      )
      render(<Mapa />, { wrapper: MemoryRouter })

      expect(useRutaEvacuacion).toHaveBeenLastCalledWith({ sismos: dosSismos, bloqueos: [bloqueo], refugios })
    })

    it('los bloqueos que recibe la ruta son el mismo arreglo entre renders', () => {
      const bloqueos = { type: 'FeatureCollection', features: [] }
      simularSupabaseListo({ useRefugios, useBloqueos, useSesion }, { bloqueos: { bloqueos } })
      const { rerender } = render(<Mapa />, { wrapper: MemoryRouter })
      const primero = useRutaEvacuacion.mock.lastCall[0].bloqueos
      rerender(<Mapa />)
      expect(useRutaEvacuacion.mock.lastCall[0].bloqueos).toBe(primero)
    })

    it('pasa la ruta, el origen y el destino a CapaRutasEvacuacion', () => {
      conRuta()
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(capas.ruta).toMatchObject({ ruta: RUTA, origen: [-100.3099, 25.6701], destino: [-100.3001, 25.6702] })
    })

    it('sin ruta no dibuja ni origen ni destino', () => {
      simularEvacuacion({ estado: 'sin-ruta', motivo: 'refugios-inalcanzables', origen: [-100.3099, 25.6701] })
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(capas.ruta).toMatchObject({ ruta: null, origen: null, destino: null })
    })

    it('sin datos de sismos la ruta se dibuja gris (riesgo desconocido)', () => {
      conRuta({ sinDatosSismos: true })
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(capas.ruta.ruta.properties.nivelRiesgo).toBe('desconocido')
      expect(capas.ruta.ruta.geometry).toEqual(RUTA.geometry)
    })

    it('la capa de la ruta se dibuja después de los bloqueos para quedar encima', () => {
      conRuta()
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(ordenRender.lastIndexOf('ruta')).toBeGreaterThan(ordenRender.lastIndexOf('bloqueos'))
    })

    it('si los bloqueos no se pudieron cargar, el panel avisa que la ruta no los toma en cuenta', () => {
      simularSupabaseListo({ useRefugios, useBloqueos, useSesion }, { bloqueos: { bloqueos: null, estado: 'error' } })
      conRuta()
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(
        screen.getByText('No se pudieron cargar los bloqueos reportados: la ruta no los toma en cuenta.'),
      ).toBeInTheDocument()
    })

    it('el panel muestra el resumen de la ruta', () => {
      conRuta()
      render(<Mapa />, { wrapper: MemoryRouter })
      expect(screen.getByText('Punto de reunión Plaza Hidalgo: 1.0 km · unos 15 min a pie · riesgo bajo')).toBeInTheDocument()
    })
  })

})

describe('Página Mapa: incidentes (etapa 6)', () => {
  const INCIDENTES = { type: 'FeatureCollection', features: [] }

  beforeEach(() => {
    delete capas.incidentes
    useIncidentes.mockReset().mockReturnValue({ incidentes: INCIDENTES, estado: 'listo', recargar: vi.fn() })
    simularSismos({ estado: 'listo', sismos: dosSismos, actualizadoEn: 1700000000000 })
    simularCiclones()
    simularSatelite()
  })

  it('un ciudadano no pide ni ve incidentes', () => {
    simularSupabaseListo({ useRefugios, useBloqueos, useSesion })
    render(<Mapa />, { wrapper: MemoryRouter })

    expect(useIncidentes).toHaveBeenCalledWith(false)
    expect(capas.incidentes).toBeUndefined()
    expect(screen.queryByRole('checkbox', { name: 'Incidentes' })).toBeNull()
  })

  it('brigadistas y coordinadores ven la capa de incidentes y la pueden apagar', () => {
    simularSupabaseListo({ useRefugios, useBloqueos, useSesion }, { sesion: { rol: 'coordinador' } })
    render(<Mapa />, { wrapper: MemoryRouter })

    expect(useIncidentes).toHaveBeenCalledWith(true)
    expect(capas.incidentes.incidentes).toBe(INCIDENTES)
    expect(capas.bloqueos.alCrearIncidente).toEqual(expect.any(Function))

    act(() => screen.getByRole('checkbox', { name: 'Incidentes' }).click())
    expect(capas.incidentes.visible).toBe(false)
  })
})
