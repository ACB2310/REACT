// @ts-nocheck -- código sin tipos a propósito (el equipo usa JavaScript); Deno lo ejecuta igual
// Edge Function `rutas` (etapa 4): ruta al refugio abierto al que se llega más rápido,
// a pie o en carro, evitando bloqueos y zonas de peligro, con OpenRouteService (ORS).
//
// La llave de ORS es el secreto ORS_API_KEY de Supabase: NUNCA llega al navegador.
// La lógica (qué refugios, qué evitar, qué ruta gana) está en logica.js y tiene pruebas.
// Este archivo solo conecta: la petición, la sesión, Supabase y ORS.
//
// Petición:  POST { origen: [longitud, latitud], modo: 'a_pie' | 'carro' }
//            con la sesión de la persona (también anónima): supabase.functions.invoke('rutas')
// Respuesta: { estado: 'ruta', destino, ruta, resumen, evitados, origenEnZona, consultadoEn }
//            { estado: 'sin-ruta', motivo, consultadoEn }
//            o un error { codigo } con su estado HTTP

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ErrorRutas, PERFILES, codigoErrorOrs, planificarRuta } from './logica.js'

const ORS = 'https://api.openrouteservice.org'
const TIEMPO_LIMITE_MS = 15000
// Misma caja que dentro_de_mexico() en SQL: [oeste, sur, este, norte]
const CAJA_MEXICO = [-118.6, 14.3, -86.5, 32.8]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Estado HTTP de cada error que puede devolver la función
const ESTADOS_HTTP = {
  DATOS_INVALIDOS: 400,
  SIN_SESION: 401,
  LIMITE_RUTAS: 429,
  ORS_LIMITE: 503,
  ORS_LLAVE: 503,
  ORS_ERROR: 502,
  SUPABASE_ERROR: 502,
  ERROR_INTERNO: 500,
}

function responder(cuerpo, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function responderError(codigo) {
  return responder({ codigo }, ESTADOS_HTTP[codigo] ?? 500)
}

// Petición a ORS con tiempo límite. Los errores de ORS se convierten en códigos de la app.
async function pedirOrs(ruta, cuerpo) {
  const llave = Deno.env.get('ORS_API_KEY')
  if (!llave) throw new ErrorRutas('ORS_LLAVE')
  let respuesta
  try {
    respuesta = await fetch(`${ORS}${ruta}`, {
      method: 'POST',
      headers: {
        Authorization: llave,
        'Content-Type': 'application/json',
        Accept: 'application/json, application/geo+json',
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    })
  } catch {
    throw new ErrorRutas('ORS_ERROR')
  }
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw new ErrorRutas(codigoErrorOrs(respuesta.status, datos))
  return datos
}

// Tiempos (s) desde puntos[0] a cada uno de los demás. La matriz no acepta zonas a evitar.
async function pedirMatriz(perfil, puntos) {
  const datos = await pedirOrs(`/v2/matrix/${perfil}`, {
    locations: puntos,
    sources: [0],
    destinations: puntos.slice(1).map((_, i) => i + 1),
    metrics: ['duration'],
  })
  return datos?.durations?.[0] ?? []
}

// Ruta real de origen a destino evitando `avoid` (MultiPolygon o null), con instrucciones en español
async function pedirRuta(perfil, origen, destino, avoid) {
  const cuerpo = { coordinates: [origen, destino], language: 'es', instructions: true }
  if (avoid) cuerpo.options = { avoid_polygons: avoid }
  const datos = await pedirOrs(`/v2/directions/${perfil}/geojson`, cuerpo)
  const ruta = datos?.features?.[0]
  if (!ruta) throw new ErrorRutas('SIN_RUTA')
  return ruta
}

function origenValido(origen) {
  if (!Array.isArray(origen) || origen.length !== 2) return false
  const [lng, lat] = origen
  return (
    Number.isFinite(lng) && Number.isFinite(lat) &&
    lng >= CAJA_MEXICO[0] && lng <= CAJA_MEXICO[2] && lat >= CAJA_MEXICO[1] && lat <= CAJA_MEXICO[3]
  )
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (peticion.method !== 'POST') return responderError('DATOS_INVALIDOS')

  const cuerpo = await peticion.json().catch(() => null)
  const origen = cuerpo?.origen
  const modo = cuerpo?.modo
  if (!origenValido(origen) || !PERFILES[modo]) return responderError('DATOS_INVALIDOS')

  // Cliente de Supabase con la sesión de la persona: se respetan las políticas RLS.
  // La llave pública llega en el encabezado apikey (supabase-js la manda sola).
  const llavePublica = peticion.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const autorizacion = peticion.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', llavePublica, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  })

  try {
    // Sesión obligatoria (también anónima): así se puede limitar el uso por persona
    const { data: usuario, error: errorUsuario } = await supabase.auth.getUser()
    if (errorUsuario || !usuario?.user) return responderError('SIN_SESION')

    const { error: errorLimite } = await supabase.rpc('registrar_consulta_ruta')
    if (errorLimite) {
      return responderError(String(errorLimite.message).includes('LIMITE_RUTAS') ? 'LIMITE_RUTAS' : 'SUPABASE_ERROR')
    }

    const [refugios, bloqueos, zonas] = await Promise.all([
      supabase.from('refugios_vista').select('id, nombre, direccion, municipio, estado, longitud, latitud').eq('estado', 'abierto'),
      supabase.from('bloqueos_vista').select('id, tipo, longitud, latitud'),
      supabase.from('zonas_peligro_vista').select('id, severidad, geojson'),
    ])
    if (refugios.error || bloqueos.error || zonas.error) {
      console.error('Error al leer Supabase', refugios.error ?? bloqueos.error ?? zonas.error)
      return responderError('SUPABASE_ERROR')
    }

    const resultado = await planificarRuta({
      origen,
      modo,
      refugios: refugios.data ?? [],
      bloqueos: bloqueos.data ?? [],
      zonas: zonas.data ?? [],
      pedirMatriz,
      pedirRuta,
    })
    return responder({ ...resultado, consultadoEn: new Date().toISOString() })
  } catch (error) {
    if (error instanceof ErrorRutas) return responderError(error.codigo)
    console.error('Error inesperado en rutas', error)
    return responderError('ERROR_INTERNO')
  }
})
