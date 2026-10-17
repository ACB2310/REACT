import { createContext } from 'react'

// Contexto con la sesión del usuario. Lo llena <ProveedorSesion> y se lee con useSesion().
export const ContextoSesion = createContext(null)
