import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { calcularRutaRefugio } from './rutasOrs.js'
import { obtenerZonas, crearZona, desactivarZona, suscribirseAZonas } from './zonas.js'
import { obtenerCliente } from './supabase.js'
import { crearSupabaseFalso } from '../test/supabaseFalso.js'

vi.mock('./supabase.js', () => ({ obtenerCliente: vi.fn() }))

let cliente
beforeEach(() => {
  cliente = crearSupabaseFalso()
  obtenerCliente.mockReturnValue(cliente)
})

// Así devuelve supabase-js un error HTTP de la función: el cuerpo está en context
function errorHttp(status, cuerpo) {
  return new FunctionsHttpError(new Response(JSON.stringify(cuerpo), { status }))
}

const RUTA = {
  estado: 'ruta',
  modo: 'a_pie',
  destino: { id: 1, nombre: 'Refugio Centro', posicion: [-103.34, 20.67] },
  ruta: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-103.35, 20.67], [-103.34, 20.67]] }, properties: {} },
  resumen: { distanciaM: 1040, duracionS: 780, pasos: [] },
  evitados: { bloqueos: 1, zonas: 0 },
  origenEnZona: false,
  consultadoEn: '2026-10-17T18:00:00.000Z',
}

describe('calcularRutaRefugio', () => {
  it('llama a la función rutas con [longitud, latitud] y el modo', async () => {
    cliente.respuestas.funciones.rutas = { data: RUTA, error: null }
    const controlador = new AbortController()

    const resultado = await calcularRutaRefugio({ origen: [-103.35, 20.67], modo: 'carro', signal: controlador.signal })

    expect(cliente.functions.invoke).toHaveBeenCalledWith('rutas', {
      body: { origen: [-103.35, 20.67], modo: 'carro' },
      signal: controlador.signal,
    })
    expect(resultado.destino.nombre).toBe('Refugio Centro')
    expect(resultado.consultadoEn).toBe(Date.parse('2026-10-17T18:00:00.000Z'))
  })

  it('"sin ruta" llega como resultado, no como error', async () => {
    cliente.respuestas.funciones.rutas = { data: { estado: 'sin-ruta', motivo: 'bloqueada' }, error: null }
    await expect(calcularRutaRefugio({ origen: [-103.35, 20.67], modo: 'a_pie' })).resolves.toMatchObject({
      estado: 'sin-ruta',
      motivo: 'bloqueada',
    })
  })

  it.each([
    [429, 'LIMITE_RUTAS', 'Ya pediste muchas rutas'],
    [503, 'ORS_LIMITE', 'llegó a su límite de hoy'],
    [503, 'ORS_LLAVE', 'no está configurado'],
  ])('error %i con %s llega en español y con su código', async (status, codigo, mensaje) => {
    cliente.respuestas.funciones.rutas = { data: null, error: errorHttp(status, { codigo }) }
    await expect(calcularRutaRefugio({ origen: [-103.35, 20.67], modo: 'a_pie' })).rejects.toMatchObject({
      codigo,
      message: expect.stringContaining(mensaje),
    })
  })

  it('si la función no está desplegada lo dice', async () => {
    cliente.respuestas.funciones.rutas = { data: null, error: errorHttp(404, { message: 'Not found' }) }
    await expect(calcularRutaRefugio({ origen: [-103.35, 20.67], modo: 'a_pie' })).rejects.toMatchObject({
      codigo: 'FUNCION_NO_DISPONIBLE',
    })
  })

  it('sin red da SIN_CONEXION', async () => {
    cliente.respuestas.funciones.rutas = { data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) }
    await expect(calcularRutaRefugio({ origen: [-103.35, 20.67], modo: 'a_pie' })).rejects.toMatchObject({
      codigo: 'SIN_CONEXION',
      message: 'No se pudo conectar con el servicio de rutas.',
    })
  })
})

describe('zonas', () => {
  it('obtenerZonas convierte el GeoJSON de la vista en polígonos', async () => {
    cliente.respuestas.vistas.zonas_peligro_vista = {
      data: [
        {
          id: 1,
          origen: 'manual',
          severidad: 1,
          descripcion: 'Fuga de gas',
          expira_en: null,
          creado_en: '2026-10-17T18:00:00+00:00',
          geojson: '{"type":"Polygon","coordinates":[[[-103.35,20.67],[-103.34,20.67],[-103.34,20.68],[-103.35,20.67]]]}',
        },
        { id: 2, severidad: 1, geojson: 'roto' },
      ],
      error: null,
    }
    const { datos } = await obtenerZonas()
    expect(datos.features).toHaveLength(1)
    expect(datos.features[0].geometry.coordinates[0][0]).toEqual([-103.35, 20.67])
    expect(datos.features[0].properties).toMatchObject({ severidad: 1, descripcion: 'Fuga de gas', expiraEn: null })
  })

  it('crearZona manda un Polygon GeoJSON [longitud, latitud] y la fecha en ISO', async () => {
    const anillo = [[-103.35, 20.67], [-103.34, 20.67], [-103.34, 20.68], [-103.35, 20.67]]
    await crearZona({ anillo, severidad: 2, descripcion: 'x', expiraEn: Date.UTC(2026, 9, 18) })
    expect(cliente.rpc).toHaveBeenCalledWith('crear_zona_peligro', {
      p_geojson: JSON.stringify({ type: 'Polygon', coordinates: [anillo] }),
      p_severidad: 2,
      p_descripcion: 'x',
      p_expira_en: '2026-10-18T00:00:00.000Z',
    })
  })

  it('ZONA_GRANDE llega en español', async () => {
    cliente.respuestas.rpc.crear_zona_peligro = { data: null, error: { message: 'ZONA_GRANDE' } }
    await expect(crearZona({ anillo: [] })).rejects.toThrow('demasiado grande')
  })

  it('desactivarZona y el canal privado zonas-cambios', async () => {
    await desactivarZona(3)
    expect(cliente.rpc).toHaveBeenCalledWith('desactivar_zona_peligro', { p_id: 3 })

    const alCambiar = vi.fn()
    const cancelar = suscribirseAZonas(alCambiar)
    expect(cliente.channel).toHaveBeenCalledWith('zonas-cambios', { config: { private: true } })
    cliente.simularCambio()
    expect(alCambiar).toHaveBeenCalled()
    cancelar()
    expect(cliente.removeChannel).toHaveBeenCalled()
  })
})
