import { describe, it, expect, vi, afterEach } from 'vitest'
import { obtenerCiclonesGdacs, URL_GDACS_CICLONES } from './gdacs.js'
import { respuestaGdacsEjemplo } from '../mocks/ciclonesEjemplo.js'

function responder(cuerpo) {
  const fetchFalso = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) })
  vi.stubGlobal('fetch', fetchFalso)
  return fetchFalso
}

describe('obtenerCiclonesGdacs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pide la lista de ciclones tropicales de GDACS', async () => {
    const fetchFalso = responder(respuestaGdacsEjemplo)
    await obtenerCiclonesGdacs()
    expect(fetchFalso.mock.calls[0][0]).toBe(
      'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC',
    )
    expect(URL_GDACS_CICLONES).toBe(fetchFalso.mock.calls[0][0])
  })

  it('deja solo ciclones actuales cerca de México', async () => {
    responder(respuestaGdacsEjemplo)
    const { eventos } = await obtenerCiclonesGdacs()
    // SIMON y TRUDY sí; POLO ya terminó; CHAMPI está en el Pacífico occidental
    expect(eventos.features.map((e) => e.properties.eventid)).toEqual([1001335, 1001340])
  })

  it('lee datemodified como UTC', async () => {
    responder(respuestaGdacsEjemplo)
    const { eventos } = await obtenerCiclonesGdacs()
    expect(eventos.features[0].properties.fechaModificacion).toBe(Date.UTC(2026, 9, 16, 20, 53, 55))
  })

  it('actualizadoEn es la modificación más reciente', async () => {
    responder(respuestaGdacsEjemplo)
    const { actualizadoEn } = await obtenerCiclonesGdacs()
    expect(actualizadoEn).toBe(Date.UTC(2026, 9, 16, 21, 10, 0))
  })

  it('aplana url.report en urlReporte y deja propiedades planas', async () => {
    responder(respuestaGdacsEjemplo)
    const { eventos } = await obtenerCiclonesGdacs()
    expect(eventos.features[0].properties).toEqual({
      eventid: 1001335,
      eventname: 'SIMON-26',
      alertlevel: 'Orange',
      episodealertlevel: 'Green',
      fechaModificacion: Date.UTC(2026, 9, 16, 20, 53, 55),
      urlReporte: 'https://www.gdacs.org/report.aspx?eventid=1001335&episodeid=38&eventtype=TC',
    })
  })

  it('no guarda urlReporte si no es https', async () => {
    const original = respuestaGdacsEjemplo.features[0]
    const conUrlRara = {
      ...original,
      properties: { ...original.properties, url: { ...original.properties.url, report: 'javascript:alert(1)' } },
    }
    responder({ ...respuestaGdacsEjemplo, features: [conUrlRara] })
    const { eventos } = await obtenerCiclonesGdacs()
    expect(eventos.features[0].properties.urlReporte).toBeNull()
  })

  // En días sin ciclones cerca, la hora de la lista de GDACS sigue siendo útil
  it('actualizadoEn usa la modificación más reciente de toda la lista, aunque no quede ningún evento', async () => {
    const lejanos = respuestaGdacsEjemplo.features.filter((e) => ['POLO-26', 'CHAMPI-26'].includes(e.properties.eventname))
    responder({ ...respuestaGdacsEjemplo, features: lejanos })

    const { eventos, actualizadoEn } = await obtenerCiclonesGdacs()
    expect(eventos.features).toEqual([])
    expect(actualizadoEn).toBe(Date.UTC(2026, 9, 16, 18, 0, 0))
  })

  it('sin eventos actualizadoEn es null', async () => {
    responder({ type: 'FeatureCollection', features: [] })
    const { eventos, actualizadoEn } = await obtenerCiclonesGdacs()
    expect(eventos.features).toEqual([])
    expect(actualizadoEn).toBeNull()
  })

  it('falla si cambia el formato', async () => {
    responder({ mensaje: 'mantenimiento' })
    await expect(obtenerCiclonesGdacs()).rejects.toThrow('Formato inesperado de GDACS')
  })
})
