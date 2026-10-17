import { useCallback, useState } from 'react'

const CLAVE = 'modo-ruta'

// localStorage puede estar bloqueado (modo privado) o lleno: entonces solo no se recuerda
function leer() {
  try {
    const valor = localStorage.getItem(CLAVE)
    return valor === 'carro' ? 'carro' : 'a_pie'
  } catch {
    return 'a_pie'
  }
}

// 'a_pie' o 'carro', recordado en el teléfono para la próxima vez (A pie por defecto)
export function useModoRuta() {
  const [modo, setModo] = useState(leer)
  const cambiar = useCallback((nuevo) => {
    setModo(nuevo)
    try {
      localStorage.setItem(CLAVE, nuevo)
    } catch {
      // Sin almacenamiento la elección dura hasta cerrar la app
    }
  }, [])
  return [modo, cambiar]
}
