import { useEffect } from 'react'
import { Popup } from 'maplibre-gl'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import { TIPOS_BLOQUEO, expresionColorBloqueo, puedeGestionarBloqueo, textoVencimiento } from '../utils/bloqueos.js'
import { formatearFechaHora } from '../utils/fechas.js'
import { crearElemento } from '../utils/popup.js'

const ID_FUENTE = 'bloqueos'
const ID_CAPA = 'bloqueos-puntos'
// Capa invisible más grande para tocar con el dedo
const ID_CAPA_TOQUE = 'bloqueos-toque'
const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }

// Botón del popup que ejecuta `accion()` y muestra el error si falla.
// Mientras trabaja se deshabilita para no mandar la misma acción dos veces.
function crearBoton({ texto, textoTrabajando, clase, accion, popup, zonaError }) {
  const boton = crearElemento('button', texto)
  boton.type = 'button'
  boton.className = clase
  boton.addEventListener('click', async () => {
    boton.disabled = true
    boton.textContent = textoTrabajando
    zonaError.textContent = ''
    try {
      const hecho = await accion()
      // `false` significa que la persona canceló (no confirmó)
      if (hecho === false) {
        boton.disabled = false
        boton.textContent = texto
        return
      }
      popup.remove()
    } catch (error) {
      zonaError.textContent = error.message
      boton.disabled = false
      boton.textContent = texto
    }
  })
  return boton
}

// Contenido del popup de un bloqueo. Todo con textContent: la descripción la
// escribe cualquier persona y nunca se interpreta como HTML.
function crearContenidoPopup(bloqueo, { rol, alRenovar, alEliminar, alConfirmar, alCrearIncidente, popup }) {
  const p = bloqueo.properties
  const tipo = TIPOS_BLOQUEO[p.tipo] ?? TIPOS_BLOQUEO.total
  const contenido = document.createElement('div')
  contenido.className = 'popup-mapa'
  contenido.append(
    crearElemento('strong', `Bloqueo ${tipo.etiqueta.toLowerCase()}`),
    crearElemento('p', tipo.detalle),
  )
  if (p.descripcion) contenido.append(crearElemento('p', `“${p.descripcion}”`))
  contenido.append(
    crearElemento('p', `${p.esAnonimo ? 'Reporte anónimo' : 'Reporte de usuario'} · ${p.confirmado ? 'Confirmado' : 'Sin confirmar'}`),
    crearElemento('p', `Reportado: ${formatearFechaHora(p.creadoEn)}`),
    crearElemento('p', textoVencimiento(p.expiraEn)),
  )

  if (puedeGestionarBloqueo(p, rol)) {
    const zonaError = crearElemento('p', '')
    zonaError.className = 'popup-error'
    zonaError.setAttribute('role', 'alert')
    const botones = document.createElement('div')
    botones.className = 'popup-botones'
    botones.append(
      crearBoton({
        texto: 'Renovar 24 h',
        textoTrabajando: 'Renovando…',
        clase: 'popup-boton',
        accion: () => alRenovar(p.id),
        popup,
        zonaError,
      }),
      crearBoton({
        texto: 'Eliminar',
        textoTrabajando: 'Eliminando…',
        clase: 'popup-boton popup-boton-peligro',
        accion: async () => {
          if (!window.confirm('¿Eliminar este bloqueo?')) return false
          await alEliminar(p.id)
        },
        popup,
        zonaError,
      }),
    )
    // Solo un coordinador confirma (el servidor lo vuelve a revisar). Un bloqueo
    // confirmado ya no cuenta para el límite de reportes por zona.
    if (rol === 'coordinador' && !p.confirmado) {
      botones.append(
        crearBoton({
          texto: 'Confirmar',
          textoTrabajando: 'Confirmando…',
          clase: 'popup-boton',
          accion: () => alConfirmar(p.id),
          popup,
          zonaError,
        }),
      )
    }
    // El coordinador puede convertir el bloqueo en un incidente para mandar una brigada
    if (rol === 'coordinador' && alCrearIncidente) {
      botones.append(
        crearBoton({
          texto: 'Crear incidente',
          textoTrabajando: 'Abriendo…',
          clase: 'popup-boton',
          accion: () => alCrearIncidente(p.id, bloqueo.geometry.coordinates),
          popup,
          zonaError,
        }),
      )
    }
    contenido.append(botones, zonaError)
  }
  return contenido
}

// Dibuja los bloqueos vigentes: rojo si es total y naranja si es parcial.
// Va encima de las demás capas porque es lo más urgente para moverse.
// `alRenovar(id)`, `alEliminar(id)` y `alConfirmar(id)` devuelven una promesa (ver Mapa.jsx).
// `alCrearIncidente(id, [longitud, latitud])` lleva al panel de brigadas (solo coordinador).
function CapaBloqueos({ mapa, bloqueos, visible = true, rol = 'ciudadano', alRenovar, alEliminar, alConfirmar, alCrearIncidente }) {
  function alHacerClic(evento) {
    const bloqueo = evento.features?.[0]
    if (!bloqueo) return
    const popup = new Popup({ maxWidth: '300px' })
    popup
      .setLngLat(bloqueo.geometry.coordinates)
      .setDOMContent(crearContenidoPopup(bloqueo, { rol, alRenovar, alEliminar, alConfirmar, alCrearIncidente, popup }))
      .addTo(mapa)
  }

  useCapasMapa(mapa, {
    fuentes: [{ id: ID_FUENTE, definicion: () => ({ type: 'geojson', data: bloqueos ?? COLECCION_VACIA }) }],
    capas: [
      {
        id: ID_CAPA,
        type: 'circle',
        source: ID_FUENTE,
        paint: {
          'circle-color': expresionColorBloqueo(),
          'circle-radius': 10,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      },
      {
        id: ID_CAPA_TOQUE,
        type: 'circle',
        source: ID_FUENTE,
        paint: { 'circle-radius': 22, 'circle-opacity': 0 },
      },
    ],
    clics: { [ID_CAPA_TOQUE]: alHacerClic },
    visible,
  })

  useEffect(() => {
    if (!mapa || !bloqueos) return
    mapa.getSource(ID_FUENTE)?.setData(bloqueos)
  }, [mapa, bloqueos])

  return null
}

export default CapaBloqueos
