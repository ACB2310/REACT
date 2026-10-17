import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Sin `globals: true`, Testing Library no limpia sola: se desmonta todo tras cada prueba
afterEach(() => {
  cleanup()
  // Las copias sin conexión (etapa 7) se guardan en localStorage: una prueba no debe
  // dejarle datos guardados a la siguiente
  // (las pruebas que corren en Node no tienen localStorage)
  if (typeof globalThis.localStorage?.clear === 'function') globalThis.localStorage.clear()
})
