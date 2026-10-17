# Mapa en vivo de desastres y evacuación

Plataforma web para la gestión de recursos y evacuación durante desastres naturales en México:
mapa en vivo con sismos (USGS), ciclones (NHC y GDACS), satélite (NASA GIBS), refugios y
bloqueos reportados por la ciudadanía.

> Plataforma informativa. Las indicaciones oficiales de Protección Civil, SMN y SSN tienen prioridad.

## Empezar

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # pruebas
npm run lint       # revisar el código
npm run build      # compilar para producción
```

Sin Supabase configurado la app funciona igual con sismos, ciclones y satélite; solo avisa que
refugios y bloqueos no están disponibles.

## Configurar Supabase (refugios y bloqueos)

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Copia `.env.example` como `.env.local` y pon:
   - `VITE_SUPABASE_URL`: la URL **base** del proyecto (`https://xxxx.supabase.co`, sin `/rest/v1`).
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: la **Publishable key** (`sb_publishable_…`).
   - **Nunca** pongas la Secret key (`sb_secret_…`) en este proyecto.
3. En **Authentication → Sign In / Providers**, activa **Email** y **Anonymous sign-ins**
   (los reportes sin cuenta usan sesiones anónimas).
4. En el **SQL Editor**, pega y ejecuta **en orden** los archivos de `supabase/migrations/`.
5. Verifica la seguridad: pega `supabase/pruebas/verificar_rls.sql` en el SQL Editor.
   Termina a propósito con `ERROR: RESULTADO: 18 de 18 casos OK` y no deja datos guardados.
6. Importa la lista oficial de refugios: ver `supabase/plantillas/LEEME.md`.
7. Asigna roles (brigadista, coordinador): ver `supabase/pruebas/LEEME.md`.
8. Etapa 6 (brigadas): la migración `20261017000005_brigadas.sql` se aplica igual que las demás.
   Después corre `supabase/pruebas/verificar_brigadas.sql`; debe terminar con `RESULTADO: 34 de 34 casos OK`.

## Pantallas

- **Mapa**: datos en vivo, con la fuente y la hora de cada uno.
- **Reportar**: cualquier persona marca un bloqueo en el mapa (parcial o total). Dura 24 h.
- **Entrar**: cuenta con correo y contraseña (para brigadistas y coordinadores).
- **Refugios** (solo coordinador): ubicar en el mapa los refugios de la lista oficial y
  actualizar su estado y ocupación.
- **Brigadas** (solo coordinador): crear incidentes y asignar brigadas por prioridad. La app
  sugiere la brigada disponible más cercana y el coordinador confirma con un toque.
- **Brigadas y miembros** (solo coordinador): registrar brigadas con su base fija y meter a
  las cuentas de brigadista en cada una.
- **Mi brigada** (brigadista): ver el incidente asignado y avisar el avance
  (Voy en camino → Llegué al lugar → Terminé).

Más detalles del proyecto y reglas para contribuir: `CLAUDE.md`.
