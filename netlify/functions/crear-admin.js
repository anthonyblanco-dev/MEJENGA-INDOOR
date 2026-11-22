// Función de Netlify: crea un nuevo usuario árbitro (admin).
// Se llama desde el panel del árbitro. La clave secreta de Supabase vive SOLO aquí
// (en variables de entorno de Netlify), nunca en el navegador.

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });

  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: 'Faltan variables de entorno en Netlify.' });
  }

  // 1) Verificar que quien llama tiene sesión válida de árbitro.
  //    (Como el registro público está desactivado en Supabase, todo usuario con sesión es árbitro.)
  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'No autorizado.' });

  const quien = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth },
  });
  if (!quien.ok) return json(401, { error: 'Sesión inválida. Vuelve a entrar.' });

  // 2) Validar datos
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Datos inválidos.' }); }

  const usuario = String(body.usuario || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) {
    return json(400, { error: 'Usuario: de 3 a 30 caracteres (letras, números, punto, guion).' });
  }
  if (password.length < 8) {
    return json(400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  // 3) Crear el usuario con la clave secreta
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  if (SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }

  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: `${usuario}@mejenga.app`,
      password,
      email_confirm: true,
    }),
  });

  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const yaExiste = r.status === 422 || /already|registered|exists/i.test(JSON.stringify(j));
    return json(yaExiste ? 409 : 500, {
      error: yaExiste ? 'Ese usuario ya existe.' : 'No se pudo crear el usuario.',
    });
  }

  return json(200, { ok: true, usuario });
};
