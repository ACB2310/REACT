-- Etapa 3 · Migración 1: perfiles y roles
-- Se pega completa en el SQL Editor de Supabase (o con `supabase db push`).

-- PostGIS para guardar puntos geográficos (refugios y bloqueos).
-- Supabase recomienda instalar las extensiones en el esquema "extensions".
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Tabla de perfiles: un renglón por cada usuario CON cuenta (no anónimo).
-- Guarda el rol, que decide qué puede hacer cada quien.
-- ---------------------------------------------------------------------------
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  rol text not null default 'ciudadano'
    check (rol in ('ciudadano', 'brigadista', 'coordinador')),
  creado_en timestamptz not null default now()
);

comment on table public.perfiles is
  'Rol de cada usuario con cuenta. Los anónimos no tienen perfil y cuentan como ciudadano.';

alter table public.perfiles enable row level security;

-- ---------------------------------------------------------------------------
-- rol_actual(): devuelve el rol de quien hace la petición.
-- Es "security definer" para poder leer perfiles sin depender de las políticas
-- (si no, una política de perfiles que llama a rol_actual() se llamaría a sí misma).
-- Sin sesión o con sesión anónima devuelve 'ciudadano'.
-- ---------------------------------------------------------------------------
create function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.rol from public.perfiles p where p.id = auth.uid()),
    'ciudadano'
  );
$$;

revoke execute on function public.rol_actual() from public;
grant execute on function public.rol_actual() to anon, authenticated;

-- Cada quien ve su propio perfil; el coordinador ve todos.
-- No hay políticas de insert, update ni delete: nadie puede cambiarse el rol
-- desde la app. El rol se asigna desde el SQL Editor (ver supabase/pruebas/LEEME.md).
create policy "Ver mi perfil o todos si soy coordinador"
  on public.perfiles for select
  to authenticated
  using (id = (select auth.uid()) or (select public.rol_actual()) = 'coordinador');

-- ---------------------------------------------------------------------------
-- Al crear una cuenta (no anónima) se crea su perfil como ciudadano.
-- ---------------------------------------------------------------------------
create function public.crear_perfil_de_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(new.is_anonymous, false) then
    insert into public.perfiles (id) values (new.id)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.crear_perfil_de_usuario() from public, anon, authenticated;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_de_usuario();

-- Si un usuario anónimo luego crea su cuenta (vincula correo), se le crea el perfil.
create trigger al_convertir_anonimo
  after update of is_anonymous on auth.users
  for each row
  when (old.is_anonymous and not new.is_anonymous)
  execute function public.crear_perfil_de_usuario();
