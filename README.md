# ⚽ La Mejenga: guía paso a paso

App web para anotarse a la mejenga. Jugadores sin login, árbitro (admin) con usuario y contraseña.

```
mejenga/
├─ public/index.html                    ← la página (aquí pegas tus claves de Supabase)
├─ supabase/schema.sql                  ← tablas, reglas de seguridad y funciones
├─ netlify/functions/crear-admin.js     ← permite crear árbitros desde la página
└─ netlify.toml                         ← configuración de Netlify
```

---

## Paso 1: Crear el proyecto en Supabase

1. Entra a https://supabase.com y crea una cuenta (gratis).
2. **New project** → ponle nombre (ej. `mejenga`), crea una contraseña de base de datos (guárdala) y elige una región cercana.
3. Espera 1-2 minutos a que termine de crearse.

## Paso 2: Crear las tablas y reglas

1. En Supabase: **SQL Editor → New query**.
2. Abre `supabase/schema.sql`, copia **todo**, pégalo y presiona **Run**.
3. Debe decir "Success". Si lo corres dos veces dará error porque las tablas ya existen: es normal.

## Paso 3: Crear tu usuario árbitro (el primero)

1. **Authentication → Users → Add user → Create new user**.
2. Email: `admin@mejenga.app` (puedes cambiar `admin` por el nombre que quieras, pero siempre termina en `@mejenga.app`).
3. Pon una contraseña y marca **Auto Confirm User**.
4. En la página entrarás solo con la parte antes de la arroba (ej. `admin`) y esa contraseña.

## Paso 4: Desactivar el registro público (MUY importante)

1. **Authentication → Sign In / Providers** (o "Settings" en versiones anteriores).
2. Desactiva **Allow new users to sign up**.
3. Confirma que **Allow anonymous sign-ins** esté desactivado.

Sin esto, cualquier persona podría crearse una cuenta y volverse árbitro. Los nombres de los menús pueden variar un poco según la versión del panel.

## Paso 5: Copiar tus claves a la página

1. **Project Settings → API** (a veces aparece como "API Keys").
2. Copia:
   - **Project URL** (algo como `https://abcd1234.supabase.co`)
   - **anon / publishable key** (la clave pública)
3. Abre `public/index.html` y reemplaza, al inicio del `<script>`:
   ```js
   const SUPABASE_URL = 'PEGA_AQUI_TU_URL';
   const SUPABASE_ANON_KEY = 'PEGA_AQUI_TU_CLAVE_PUBLICA';
   ```
   La clave pública **sí puede ir en el código**: la protección real son las reglas del Paso 2.

## Paso 6: Publicar en Netlify (con GitHub)

Para que funcione la creación de árbitros hace falta la función de Netlify, así que se despliega desde GitHub (arrastrar y soltar una carpeta no sirve para la función).

1. Crea un repositorio en GitHub y sube **toda la carpeta `mejenga`** (con `public/`, `netlify/`, `supabase/` y `netlify.toml`).
2. En Netlify: **Add new site → Import an existing project → GitHub** y elige el repositorio.
3. No toques la configuración de build: `netlify.toml` ya lo trae resuelto.
4. Antes de terminar, o después en **Site configuration → Environment variables**, agrega estas tres variables:

   | Variable | Valor |
   |---|---|
   | `SUPABASE_URL` | la misma URL del Paso 5 |
   | `SUPABASE_ANON_KEY` | la misma clave pública del Paso 5 |
   | `SUPABASE_SERVICE_ROLE_KEY` | la clave **secreta** (en la misma pantalla de API: `service_role` o "secret key") |

5. La clave secreta **nunca** va en `index.html` ni en GitHub. Solo en Netlify.
6. Si agregaste las variables después de desplegar, haz **Deploys → Trigger deploy** para que las tome.

## Paso 7: Probar

1. Abre tu link de Netlify → pestaña **🟨 Árbitro** → entra con tu usuario.
2. Crea una mejenga (fecha, lugar, 14 cupos).
3. Abre el link en otro celular o en una ventana privada y anótate con distintos nombres.
4. Verifica: el cupo 15 queda en la banca; si alguien se quita (🟥), el primero de la banca sube.
5. Prueba **Agregar otro árbitro** y entra con esas credenciales en una ventana privada.
6. Usa **📲 Copiar mensaje** y pégalo en el grupo de WhatsApp.

---

## Cómo funciona (resumen)

- **Jugadores**: solo escriben su nombre. Cada dispositivo guarda un código secreto para poder quitarse a sí mismo. Máximo 3 anotaciones por dispositivo (uno mismo + 2 amigos).
- **Orden y banca**: se ordena por hora exacta de registro. Los primeros N (los cupos) son titulares; el resto, banca. Si se cambia la cantidad de cupos, se reacomoda solo.
- **Árbitros**: pueden crear, editar, cerrar y eliminar mejengas, quitar a cualquiera y anotarse.
- **Tiempo real**: la lista se actualiza sola en todos los celulares (más una recarga de respaldo cada 30 segundos).
- Las mejengas desaparecen de la vista de jugadores 6 horas después de su hora; el árbitro las sigue viendo para limpiarlas.

## Mantenimiento

| Quiero... | Qué hago |
|---|---|
| Cambiar colores, textos o animaciones | Editar `public/index.html` y hacer push a GitHub; Netlify publica solo en ~1 minuto |
| Agregar un dato nuevo (ej. costo por jugador) | Una línea de SQL: `alter table public.mejengas add column costo int;` + un campo en los formularios del HTML |
| Agregar un árbitro | Desde la página: pestaña Árbitro → "Agregar otro árbitro" |
| Quitar un árbitro | Supabase → Authentication → Users → borrar el usuario |
| Cambiar la contraseña de un árbitro | Supabase → Authentication → Users → editar el usuario |
| Recrear la base desde cero | Proyecto nuevo + ejecutar `supabase/schema.sql` otra vez |

Notas:
- Guarda `schema.sql` siempre en el repositorio: es el "plano" de tu base de datos.
- Hasta donde sé, Supabase pausa los proyectos gratuitos tras aproximadamente una semana sin actividad; si pasa, se reactiva con un clic en el panel. Conviene confirmarlo en su documentación actual.
- Si Netlify muestra error al crear árbitros, revisa que las 3 variables de entorno estén bien escritas y que hayas vuelto a desplegar.
- El límite de 3 anotaciones por dispositivo es una cortesía, no un candado absoluto (alguien con conocimientos podría saltarlo). Para un grupo de amigos es más que suficiente; la lista tiene además un tope de 100 personas por mejenga.
