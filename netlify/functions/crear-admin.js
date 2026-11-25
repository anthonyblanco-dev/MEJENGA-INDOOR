// Función de Netlify: crea un nuevo usuario árbitro (admin).
// Se llama desde el panel del árbitro. La clave secreta de Supabase vive SOLO aquí
// (en variables de entorno de Netlify), nunca en el navegador.

const DOMINIO = '@mejenga.app';
const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

// Acepta "carlos" o "carlos@mejenga.app" y siempre devuelve "carlos"
const normalizarUsuario = u =>
  String(u || '').trim().toLowerCase().replace(/@mejenga\.app$/, '');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });

  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const faltan = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k]);
  if (faltan.length) {
    return json(500, {
      error: `Faltan variables de entorno en Netlify: ${faltan.join(', ')}. Agrégalas y vuelve a desplegar el sitio.`,
    });
  }
  const base = SUPABASE_URL.replace(/\/+$/, '');

  // 1) Verificar que quien llama tiene sesión válida de árbitro.
  //    (Como el registro público está desactivado en Supabase, todo usuario con sesión es árbitro.)
  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'No autorizado.' });

  const quien = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth },
  });
  if (!quien.ok) return json(401, { error: 'Sesión inválida. Vuelve a entrar.' });

  // 2) Validar datos
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Datos inválidos.' }); }

  const usuario = normalizarUsuario(body.usuario);
  const password = String(body.password || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) {
    return json(400, { error: 'Usuario: de 3 a 30 caracteres (letras, números, punto, guion o guion bajo).' });
  }
  if (password.length < 8) {
    return json(400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  // 3) Crear el usuario con la clave secreta
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  if (SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;   // clave antigua (JWT)
  }

  const r = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: usuario + DOMINIO,
      password,
      email_confirm: true,
    }),
  });

  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const texto = JSON.stringify(j);
    if (r.status === 422 && /already|registered|exists/i.test(texto)) {
      return json(409, { error: 'Ese usuario ya existe.' });
    }
    if (/password/i.test(texto) && r.status === 422) {
      return json(400, { error: 'La contraseña no es aceptada por Supabase. Prueba con otra más larga.' });
    }
    if (r.status === 401 || r.status === 403) {
      return json(500, { error: 'La clave secreta de Supabase (SUPABASE_SERVICE_ROLE_KEY) no es válida. Revísala en Netlify.' });
    }
    return json(500, { error: 'No se pudo crear el usuario.' });
  }

  return json(200, { ok: true, usuario });
};
