// Función de Netlify: permite a un árbitro cambiar SU PROPIO usuario y/o contraseña.
// Exige la contraseña actual. La clave secreta de Supabase vive solo en Netlify.

const DOMINIO = '@mejenga.app';
const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});
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

  // 1) ¿Quién llama? (sesión válida)
  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'No autorizado.' });

  const quien = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth },
  });
  if (!quien.ok) return json(401, { error: 'Sesión inválida. Vuelve a entrar.' });
  const yo = await quien.json().catch(() => ({}));
  if (!yo.id || !yo.email) return json(401, { error: 'Sesión inválida. Vuelve a entrar.' });

  // 2) Validar datos
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Datos inválidos.' }); }

  const passwordActual = String(body.passwordActual || '');
  const usuarioActual = normalizarUsuario(yo.email);
  const nuevoUsuario = body.nuevoUsuario ? normalizarUsuario(body.nuevoUsuario) : '';
  const nuevaPassword = String(body.nuevaPassword || '');

  if (!passwordActual) return json(400, { error: 'Escribe tu contraseña actual para confirmar los cambios.' });

  const cambiaUsuario = nuevoUsuario && nuevoUsuario !== usuarioActual;
  const cambiaPassword = nuevaPassword.length > 0;
  if (!cambiaUsuario && !cambiaPassword) return json(400, { error: 'No hay nada que cambiar.' });

  if (cambiaUsuario && !/^[a-z0-9._-]{3,30}$/.test(nuevoUsuario)) {
    return json(400, { error: 'Usuario: de 3 a 30 caracteres (letras, números, punto, guion o guion bajo).' });
  }
  if (cambiaPassword && nuevaPassword.length < 8) {
    return json(400, { error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  // 3) Comprobar la contraseña actual (inicia sesión con ella; no se guarda nada)
  const verif = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: yo.email, password: passwordActual }),
  });
  if (!verif.ok) return json(403, { error: 'La contraseña actual no es correcta.' });

  // 4) Aplicar los cambios SOLO al usuario que llamó
  const cambios = { email_confirm: true };
  if (cambiaUsuario) cambios.email = nuevoUsuario + DOMINIO;
  if (cambiaPassword) cambios.password = nuevaPassword;

  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  if (SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;   // clave antigua (JWT)
  }

  const r = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(yo.id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(cambios),
  });

  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const texto = JSON.stringify(j);
    if (r.status === 422 && /already|registered|exists/i.test(texto)) {
      return json(409, { error: 'Ese usuario ya está en uso. Elige otro.' });
    }
    if (r.status === 422 && /password/i.test(texto)) {
      return json(400, { error: 'La nueva contraseña no es aceptada por Supabase. Prueba con otra más larga.' });
    }
    if (r.status === 401 || r.status === 403) {
      return json(500, { error: 'La clave secreta de Supabase (SUPABASE_SERVICE_ROLE_KEY) no es válida. Revísala en Netlify.' });
    }
    return json(500, { error: 'No se pudo actualizar el perfil.' });
  }

  return json(200, {
    ok: true,
    usuario: cambiaUsuario ? nuevoUsuario : usuarioActual,
    cambioUsuario: !!cambiaUsuario,
    cambioPassword: !!cambiaPassword,
  });
};
