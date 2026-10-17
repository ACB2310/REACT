import { describe, it, expect } from 'vitest'
import { textoVencimiento, puedeGestionarBloqueo, TIPOS_BLOQUEO } from './bloqueos.js'
import { textoOcupacion, etiquetaEstadoRefugio } from './refugios.js'
import { BBOX_REPORTES_MEXICO, dentroDeCaja } from './geo.js'

const AHORA = Date.UTC(2026, 9, 16, 20, 0)
const MINUTO = 60000

describe('textoVencimiento', () => {
  it('en horas, en minutos y vencido', () => {
    expect(textoVencimiento(AHORA + 3 * 60 * MINUTO + 5 * MINUTO, AHORA)).toBe('Vence en 3 h')
    expect(textoVencimiento(AHORA + 25 * MINUTO, AHORA)).toBe('Vence en 25 min')
    expect(textoVencimiento(AHORA + 30 * 1000, AHORA)).toBe('Vencido')
    expect(textoVencimiento(AHORA, AHORA)).toBe('Vencido')
    expect(textoVencimiento(AHORA - MINUTO, AHORA)).toBe('Vencido')
  })

  it('sin fecha', () => {
    expect(textoVencimiento(null, AHORA)).toBe('Vencimiento desconocido')
  })
})

describe('puedeGestionarBloqueo', () => {
  it('quien lo reportó, brigadistas y coordinadores sí; los demás no', () => {
    expect(puedeGestionarBloqueo({ esMio: true }, 'ciudadano')).toBe(true)
    expect(puedeGestionarBloqueo({ esMio: false }, 'brigadista')).toBe(true)
    expect(puedeGestionarBloqueo({ esMio: false }, 'coordinador')).toBe(true)
    expect(puedeGestionarBloqueo({ esMio: false }, 'ciudadano')).toBe(false)
    expect(puedeGestionarBloqueo(null, 'ciudadano')).toBe(false)
  })
})

describe('textos', () => {
  it('parcial significa que no pasan vehículos', () => {
    expect(TIPOS_BLOQUEO.solo_vehiculos.etiqueta).toBe('Parcial')
    expect(TIPOS_BLOQUEO.total.detalle).toBe('No pasa nadie, ni a pie.')
  })

  it('ocupación del refugio', () => {
    expect(textoOcupacion({ ocupacion: 45, capacidad: 120 })).toBe('45 de 120 lugares ocupados')
    expect(textoOcupacion({ ocupacion: 0, capacidad: null })).toBe('Capacidad desconocida')
    expect(etiquetaEstadoRefugio('lleno')).toBe('Lleno')
    expect(etiquetaEstadoRefugio('raro')).toBe('Estado desconocido')
  })
})

describe('BBOX_REPORTES_MEXICO', () => {
  it('acepta Guadalajara y Cancún, rechaza Madrid y lat/lon invertidos', () => {
    expect(dentroDeCaja([-103.35, 20.67], BBOX_REPORTES_MEXICO)).toBe(true)
    expect(dentroDeCaja([-86.85, 21.16], BBOX_REPORTES_MEXICO)).toBe(true)
    expect(dentroDeCaja([-3.7, 40.4], BBOX_REPORTES_MEXICO)).toBe(false)
    expect(dentroDeCaja([20.67, -103.35], BBOX_REPORTES_MEXICO)).toBe(false)
  })
})
