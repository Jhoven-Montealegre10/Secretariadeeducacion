/**
 * Cliente de la API REST del panel. La sesión viaja en una cookie HttpOnly que JavaScript
 * no puede leer; aquí solo se guarda en memoria el token CSRF (nunca en el almacenamiento persistente del navegador).
 */
let csrfToken = null;

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Error de comunicación con el servidor.');
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details || [];
    this.requestId = body?.error?.requestId;
  }
}

export function setCsrf(token) {
  if (token) csrfToken = token;
}

async function ensureCsrf() {
  if (!csrfToken) {
    const r = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
    csrfToken = (await r.json()).data.csrfToken;
  }
  return csrfToken;
}

export async function api(method, path, { body, query, form } = {}) {
  const url = new URL(`/api/v1${path}`, location.origin);
  if (query) Object.entries(query).forEach(([k, v]) => v !== undefined && v !== '' && v !== null && url.searchParams.set(k, v));
  const headers = { Accept: 'application/json' };
  const unsafe = method !== 'GET';
  if (unsafe) headers['X-CSRF-Token'] = await ensureCsrf();
  let payload;
  if (form)
    payload = form; // FormData: el navegador define el multipart
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { error: { message: 'No hay conexión con el servidor.' } });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    if (err.code === 'CSRF_INVALID') csrfToken = null;
    if (res.status === 401 && !['REAUTH_REQUIRED', 'REAUTH_FAILED', 'INVALID_CREDENTIALS', 'MFA_INVALID', 'MFA_SETUP_EXPIRED'].includes(err.code)) {
      window.dispatchEvent(new CustomEvent('sesion-expirada'));
    }
    throw err;
  }
  if (data?.data?.csrfToken) setCsrf(data.data.csrfToken);
  return data;
}

export const get = (p, query) => api('GET', p, { query });
export const post = (p, body) => api('POST', p, { body });
export const put = (p, body) => api('PUT', p, { body });
export const patch = (p, body) => api('PATCH', p, { body });
export const del = (p, query) => api('DELETE', p, { query });
export const upload = (method, p, form) => api(method, p, { form });
