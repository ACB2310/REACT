// Cliente de Supabase falso SOLO PARA PRUEBAS: no sale a internet.
// Se programan las respuestas y se pueden disparar eventos de tiempo real.
//
// Uso:
//   const cliente = crearSupabaseFalso()
//   cliente.respuestas.vistas.bloqueos_vista = { data: [...], error: null }
//   cliente.respuestas.rpc.reportar_bloqueo = { data: 7, error: null }
import { vi } from 'vitest'

// `sesionInicial`: la sesión guardada en el navegador al abrir la app (o null)
export function crearSupabaseFalso({ sesionInicial = null } = {}) {
  const respuestas = { vistas: {}, rpc: {}, funciones: {} }
  const canales = []
  let alCambiarSesion = null
  let sesion = sesionInicial

  // Consulta encadenable: from('vista').select('*').gt(...).abortSignal(...)
  function consulta(vista) {
    const llamadas = []
    const constructor = {
      llamadas,
      then(resolver, rechazar) {
        const respuesta = respuestas.vistas[vista] ?? { data: [], error: null }
        return Promise.resolve(respuesta).then(resolver, rechazar)
      },
    }
    for (const metodo of ['select', 'gt', 'order', 'eq', 'abortSignal']) {
      constructor[metodo] = vi.fn((...argumentos) => {
        llamadas.push([metodo, ...argumentos])
        return constructor
      })
    }
    return constructor
  }

  const cliente = {
    respuestas,
    canales,
    from: vi.fn((vista) => consulta(vista)),
    // rpc() también es encadenable: rpc('mi_asignacion').abortSignal(signal)
    rpc: vi.fn((nombre) => {
      const constructor = {
        then(resolver, rechazar) {
          const respuesta = respuestas.rpc[nombre] ?? { data: null, error: null }
          return Promise.resolve(respuesta).then(resolver, rechazar)
        },
      }
      constructor.abortSignal = vi.fn(() => constructor)
      return constructor
    }),
    channel: vi.fn((nombre) => {
      const canal = {
        nombre,
        manejadores: [],
        on: vi.fn((tipo, filtro, manejador) => {
          canal.manejadores.push({ tipo, filtro, manejador })
          return canal
        }),
        subscribe: vi.fn(() => canal),
      }
      canales.push(canal)
      return canal
    }),
    removeChannel: vi.fn(async (canal) => {
      canales.splice(canales.indexOf(canal), 1)
    }),
    // Edge Functions: respuestas.funciones.rutas = { data, error }
    functions: {
      invoke: vi.fn(async (nombre) => respuestas.funciones[nombre] ?? { data: null, error: null }),
    },
    auth: {
      getSession: vi.fn(async () => ({ data: { session: sesion }, error: null })),
      // Como Supabase: avisa enseguida la sesión inicial (INITIAL_SESSION)
      onAuthStateChange: vi.fn((manejador) => {
        alCambiarSesion = manejador
        queueMicrotask(() => manejador('INITIAL_SESSION', sesion))
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signInAnonymously: vi.fn(async () => {
        cliente.simularSesion({ user: { id: 'anonimo-1', is_anonymous: true } })
        return { data: { session: sesion }, error: null }
      }),
      signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
      signUp: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => {
        cliente.simularSesion(null)
        return { error: null }
      }),
    },
    // Cambia la sesión y avisa como lo haría Supabase
    simularSesion(nueva) {
      sesion = nueva
      alCambiarSesion?.(nueva ? 'SIGNED_IN' : 'SIGNED_OUT', nueva)
    },
    // Dispara un cambio de tiempo real en todos los canales
    simularCambio(cambio = { eventType: 'INSERT' }) {
      for (const canal of canales) {
        for (const { manejador } of canal.manejadores) manejador(cambio)
      }
    },
  }
  return cliente
}
