// Ayudantes para armar el contenido de los popups del mapa.

// Crea un elemento con texto. Se usa `textContent` (no innerHTML) para que
// ningún texto que venga de una API se interprete como HTML.
export function crearElemento(etiqueta, texto) {
  const elemento = document.createElement(etiqueta)
  elemento.textContent = texto
  return elemento
}

// Crea un enlace que se abre en otra pestaña, solo si la dirección es https.
// Así nunca se abre algo como "javascript:...". Devuelve null si no es segura.
export function crearEnlaceSeguro(texto, url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return null
  const enlace = crearElemento('a', texto)
  enlace.href = url
  enlace.target = '_blank'
  enlace.rel = 'noopener noreferrer'
  return enlace
}
