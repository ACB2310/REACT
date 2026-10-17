# Edge Function `rutas`

Calcula la ruta al refugio abierto al que se llega más rápido (a pie o en carro),
evitando bloqueos y zonas de peligro, con OpenRouteService. La lógica está en
`logica.js` (con pruebas en `logica.test.js`); `index.ts` solo conecta Supabase y ORS.

## Antes de desplegar

1. La migración `20261017000006_zonas_y_rutas.sql` ya debe estar aplicada.
2. En Supabase → **Edge Functions → Secrets**, debe existir `ORS_API_KEY` con la llave de
   openrouteservice.org. **Nunca** la pongas en el código ni en `.env.local`.

## Desplegar desde el panel (sin instalar nada)

1. Supabase → **Edge Functions → Deploy a new function → Via Editor**.
2. Nombre de la función: **`rutas`** (exactamente así; la app la llama por ese nombre).
3. Reemplaza el contenido de `index.ts` por el de este `index.ts`.
4. Agrega un archivo nuevo llamado **`logica.js`** y pega el contenido de este `logica.js`.
5. Deja activado **Verify JWT** (la app siempre manda la sesión de la persona).
6. **Deploy**.

Cada vez que cambien `index.ts` o `logica.js` en el repositorio, hay que volver a desplegar.

## Desplegar con la CLI (alternativa)

```bash
npx supabase login
npx supabase link --project-ref <id-del-proyecto>
npx supabase functions deploy rutas
```

## Revisar que funciona

- Supabase → Edge Functions → `rutas` → **Logs**: ahí aparecen los errores (`console.error`).
- Errores que puede devolver (`{ codigo }`):

| Código | Qué pasa |
|---|---|
| `DATOS_INVALIDOS` | El origen no es un punto en México o el modo no es `a_pie`/`carro`. |
| `SIN_SESION` | La app no mandó sesión (debe llamar `asegurarSesion()` antes). |
| `LIMITE_RUTAS` | Más de 20 rutas en una hora para esa sesión. |
| `ORS_LLAVE` | Falta `ORS_API_KEY` o ORS la rechaza. |
| `ORS_LIMITE` | Se acabó la cuota diaria de ORS. |
| `ORS_ERROR` / `SUPABASE_ERROR` | ORS o Supabase no respondieron bien. |
