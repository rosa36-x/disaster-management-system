const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

export function getToken() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('dms_token');
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}/api${path}`, { ...options, headers, cache: 'no-store' });
  if (response.status === 401 && typeof window !== 'undefined') {
    sessionStorage.removeItem('dms_token');
    sessionStorage.removeItem('dms_user');
    window.location.href = '/login';
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

export const apiUrl = API_URL;
