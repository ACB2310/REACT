# Pruebas de seguridad en SQL

## Verificar RLS y permisos

1. Aplica las migraciones de `supabase/migrations/` **en orden** (pega cada archivo en el SQL Editor y ejecútalo).
2. Pega `verificar_rls.sql` completo en el SQL Editor y ejecútalo.
3. El script termina **a propósito** con un error que trae el resumen:

   ```
   ERROR: RESULTADO: 30 de 30 casos OK
   ```

   Ese error deshace todo: no quedan usuarios ni bloqueos de prueba.
   Si algún caso falla, el mensaje dice cuál y por qué.

## Asignar un rol

Los roles no se pueden cambiar desde la app. Una persona primero crea su cuenta en la app
(pantalla **Entrar**) y después, en el SQL Editor:

```sql
update public.perfiles
set rol = 'coordinador'   -- o 'brigadista' o 'ciudadano'
where id = (select id from auth.users where email = 'correo@ejemplo.com');
```

Después la persona recarga la app para que se vea su nuevo rol.

## Verificar brigadas e incidentes (etapa 6)

Después de aplicar `20261017000005_brigadas.sql`, pega `verificar_brigadas.sql` en el SQL Editor
(si pregunta por RLS, elige **Run without RLS**). Debe terminar con:

```
ERROR: RESULTADO: 34 de 34 casos OK
```

Para que un brigadista use la pantalla **Mi brigada**, primero dale el rol `brigadista` (arriba)
y luego el coordinador lo mete a una brigada en la pantalla **Brigadas y miembros**.

