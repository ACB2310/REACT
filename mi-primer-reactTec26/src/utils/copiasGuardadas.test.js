// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { copiaDatosParaRuta, textoCopiaDatosRuta } from './copiasGuardadas.js'

const fuente = (desdeAlmacen, consultadoEn) => ({ desdeAlmacen, consultadoEn })

describe('copiaDatosParaRuta', () => {
  it('dice qué datos de la ruta vienen de la copia del teléfono y el más antiguo', () => {
    expect(
      copiaDatosParaRuta({
        bloqueos: fuente(true, 3000),
        zonas: fuente(true, 1000),
        refugios: fuente(false, 5000),
      }),
    ).toEqual({ nombres: ['bloqueos', 'zonas de peligro'], desde: 1000 })
  })

  it('con datos nuevos de todo, no hay copia', () => {
    expect(copiaDatosParaRuta({ bloqueos: fuente(false, 1), zonas: fuente(false, 1), refugios: fuente(false, 1) })).toBeNull()
  })

  it('una copia sin hora igual se nombra', () => {
    expect(copiaDatosParaRuta({ bloqueos: fuente(true, null), zonas: fuente(false, 1), refugios: fuente(false, 1) })).toEqual({
      nombres: ['bloqueos'],
      desde: null,
    })
  })
})

describe('textoCopiaDatosRuta', () => {
  it('une los nombres y dice la fecha', () => {
    const formatear = () => '16 oct 2026, 16:00'
    expect(textoCopiaDatosRuta({ nombres: ['bloqueos', 'zonas de peligro', 'refugios'], desde: 1 }, formatear)).toBe(
      'Sin datos nuevos: la ruta usa bloqueos, zonas de peligro y refugios guardados en tu teléfono (del 16 oct 2026, 16:00). Puede haber cambios que no conoce.',
    )
    expect(textoCopiaDatosRuta({ nombres: ['bloqueos'], desde: null }, formatear)).toBe(
      'Sin datos nuevos: la ruta usa bloqueos guardados en tu teléfono. Puede haber cambios que no conoce.',
    )
  })
})
