# Etapa 7 (parte 1): PWA sin conexión

**Meta:** que la app se instale en el celular y sirva **sin señal**: mapa de las zonas ya vistas,
y la última copia de sismos, ciclones, refugios, bloqueos y zonas de peligro, con su fecha.
**Diseño:** en computadora queda igual; en el celular se arregla lo que se encima.

Parte de la rama `etapa-7` (compañero): `vite-plugin-pwa` 2.0 (acepta Vite 8), manifiesto,
iconos y `BotonInstalarApp` + `useInstalacionPwa`. Se juntó con `main` el 2026-10-17.

## Decisiones

- **Aviso de instalar:** solo en pantallas < 900 px y con "Ahora no" (se recuerda en el teléfono).
  En computadora no aparece (el diseño de escritorio no cambia).
- **PWA en desarrollo apagada** (`devOptions.enabled: false`): con el service worker en `npm run dev`
  se ven versiones viejas guardadas.
- **Datos guardados:** `useDatosPeriodicos(..., { guardarComo })` guarda en `localStorage` la última
  respuesta buena `{ datos, actualizadoEn, consultadoEn }` y la usa al abrir si todavía no llega nada.
  Solo datos públicos: sismos, ciclones (NHC y GDACS), refugios, bloqueos y zonas. **Nunca** incidentes
  ni brigadas (datos sensibles). Si no cabe o el almacenamiento está bloqueado, la app sigue igual.
  Las copias de más de 7 días no se usan. Bloqueos y zonas vencidos se descartan por `expiraEn`.
  La ruta sin conexión (Dijkstra) usa esas copias.
- **Mapa guardado:** Workbox guarda estilo, teselas, letras e íconos de `tiles.openfreemap.org`
  (StaleWhileRevalidate para el estilo, CacheFirst para teselas: máx. 3000, 14 días).
- **Carga más rápida:** las pantallas secundarias se cargan al abrirlas (`React.lazy`); el service
  worker las guarda igual para usarlas sin conexión.
- **Celular (< 900 px):** créditos del mapa compactos (botón ⓘ), botones flotantes sin tapar los
  créditos, panel de ruta con altura máxima y desplazamiento, botón "Usar mi ubicación" sin tapar.

## Tareas

1. Juntar `etapa-7`; PWA en desarrollo apagada.
2. Aviso de instalar: solo celular y "Ahora no" (pruebas).
3. `guardarComo` en `useDatosPeriodicos` y en los hooks públicos; zonas vencidas fuera (pruebas).
4. Workbox: caché del mapa y tamaño máximo de precache.
5. `React.lazy` en las pantallas secundarias.
6. Diseño en celular (capturas antes/después en 412×915 y 1366×768).
7. CLAUDE.md, lint, build y revisión independiente (los bloqueos guardados alimentan la ruta).
