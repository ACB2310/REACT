// Cola de prioridad (montículo binario "min-heap"): siempre entrega primero el
// elemento con la prioridad más baja. Dijkstra la usa para visitar primero el
// nodo con menor costo acumulado sin tener que ordenar toda la lista cada vez.
export function crearColaPrioridad() {
  // Cada elemento es { valor, prioridad }. El de menor prioridad está en la posición 0.
  const elementos = []

  function intercambiar(i, j) {
    ;[elementos[i], elementos[j]] = [elementos[j], elementos[i]]
  }

  // Sube un elemento mientras sea menor que su "padre"
  function subir(indice) {
    let i = indice
    while (i > 0) {
      const padre = Math.floor((i - 1) / 2)
      if (elementos[padre].prioridad <= elementos[i].prioridad) break
      intercambiar(i, padre)
      i = padre
    }
  }

  // Baja un elemento mientras alguno de sus "hijos" sea menor
  function bajar(indice) {
    let i = indice
    for (;;) {
      const izquierdo = 2 * i + 1
      const derecho = izquierdo + 1
      let menor = i
      if (izquierdo < elementos.length && elementos[izquierdo].prioridad < elementos[menor].prioridad) menor = izquierdo
      if (derecho < elementos.length && elementos[derecho].prioridad < elementos[menor].prioridad) menor = derecho
      if (menor === i) break
      intercambiar(i, menor)
      i = menor
    }
  }

  return {
    agregar(valor, prioridad) {
      elementos.push({ valor, prioridad })
      subir(elementos.length - 1)
    },
    sacarMinimo() {
      if (elementos.length === 0) return undefined
      const minimo = elementos[0]
      const ultimo = elementos.pop()
      if (elementos.length > 0) {
        elementos[0] = ultimo
        bajar(0)
      }
      return minimo
    },
    estaVacia() {
      return elementos.length === 0
    },
  }
}
