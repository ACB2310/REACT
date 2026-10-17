# Pruebas de seguridad en SQL

## Verificar RLS y permisos

1. Aplica las migraciones de `supabase/migrations/` **en orden** (pega cada archivo en el SQL Editor y ejecútalo).
2. Pega `verificar_rls.sql` completo en el SQL Editor y ejecútalo.
3. El script termina **a propósito** con un error que trae el resumen:

   ```
   ERROR: RESULTADO: 27 de 27 casos OK
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
