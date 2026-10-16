import { describe, it, expect } from 'vitest'
import {
  nudosAKmh,
  nombreTipoCiclon,
  nombreAlertaGdacs,
  nombreCorto,
  combinarCiclones,
  eventosGdacsSinNhc,
} from './ciclones.js'
import { puntosNhcEjemplo, eventosGdacsEjemplo } from '../mocks/ciclonesEjemplo.js'

describe('nudosAKmh', () => {
  it('convierte nudos a km/h redondeando', () => {
    expect(nudosAKmh(75)).toBe(139)
    expect(nudosAKmh(65)).toBe(120)
    expect(nudosAKmh(90)).toBe(167)
  })

  it('devuelve null si no hay dato', () => {
    expect(nudosAKmh(null)).toBeNull()
    expect(nudosAKmh(undefined)).toBeNull()
  })
})

describe('nombreTipoCiclon', () => {
  it('traduce los códigos del NHC', () => {
    expect(nombreTipoCiclon('HU')).toBe('Huracán')
    expect(nombreTipoCiclon('MH')).toBe('Huracán mayor')
    expect(nombreTipoCiclon('TS')).toBe('Tormenta tropical')
    expect(nombreTipoCiclon('TD')).toBe('Depresión tropical')
    expect(nombreTipoCiclon('STS')).toBe('Tormenta subtropical')
    expect(nombreTipoCiclon('STD')).toBe('Depresión subtropical')
    expect(nombreTipoCiclon('PTC')).toBe('Ciclón tropical potencial')
    expect(nombreTipoCiclon('PT')).toBe('Ciclón postropical')
  })

  it('usa "Ciclón tropical" para códigos desconocidos', () => {
    expect(nombreTipoCiclon('XX')).toBe('Ciclón tropical')
    expect(nombreTipoCiclon(undefined)).toBe('Ciclón tropical')
  })
})

describe('nombreAlertaGdacs', () => {
  it('traduce los niveles de alerta', () => {
    expect(nombreAlertaGdacs('Green')).toBe('verde')
    expect(nombreAlertaGdacs('Orange')).toBe('naranja')
    expect(nombreAlertaGdacs('Red')).toBe('roja')
    expect(nombreAlertaGdacs('')).toBeNull()
  })
})

describe('nombreCorto', () => {
  it('saca el nombre propio de NHC y de GDACS', () => {
    expect(nombreCorto('Hurricane Trudy')).toBe('Trudy')
    expect(nombreCorto('Trudy')).toBe('Trudy')
    expect(nombreCorto('SIMON-26')).toBe('Simon')
    expect(nombreCorto('Potential Tropical Cyclone Simon')).toBe('Simon')
  })
})

describe('combinarCiclones', () => {
  it('combina NHC y GDACS sin duplicar', () => {
    const ciclones = combinarCiclones(puntosNhcEjemplo, eventosGdacsEjemplo)

    expect(ciclones).toHaveLength(2)
    expect(ciclones[0]).toMatchObject({
      id: 'nhc-EP1',
      nombre: 'Trudy',
      tipo: 'Huracán',
      fuente: 'NHC',
      vientoKmh: 139,
      categoria: 1,
      alertaGdacs: 'naranja',
      posicion: [-102, 15],
    })
    expect(ciclones[1]).toMatchObject({
      id: 'gdacs-1001335',
      nombre: 'Simon',
      tipo: null,
      fuente: 'GDACS',
      vientoKmh: null,
      categoria: null,
      alertaGdacs: 'verde',
      posicion: [-110.3, 21.5],
    })
  })

  it('una depresión o tormenta no tiene categoría', () => {
    const tormenta = {
      type: 'FeatureCollection',
      features: [
        {
          ...puntosNhcEjemplo.features[0],
          properties: { ...puntosNhcEjemplo.features[0].properties, stormtype: 'TS', ssnum: 0, maxwind: 50 },
        },
      ],
    }
    expect(combinarCiclones(tormenta, null)[0]).toMatchObject({ tipo: 'Tormenta tropical', categoria: null })
  })

  it('si NHC no llegó usa solo GDACS', () => {
    const nombres = combinarCiclones(null, eventosGdacsEjemplo).map((c) => c.nombre)
    expect(nombres).toEqual(['Simon', 'Trudy'])
  })

  it('si nada llegó devuelve []', () => {
    expect(combinarCiclones(null, null)).toEqual([])
  })
})

describe('eventosGdacsSinNhc', () => {
  it('deja solo los eventos que NHC no tiene', () => {
    const resultado = eventosGdacsSinNhc(puntosNhcEjemplo, eventosGdacsEjemplo)
    expect(resultado.features.map((f) => f.properties.eventname)).toEqual(['SIMON-26'])
  })

  it('sin GDACS devuelve una colección vacía', () => {
    expect(eventosGdacsSinNhc(puntosNhcEjemplo, null)).toEqual({ type: 'FeatureCollection', features: [] })
  })
})
