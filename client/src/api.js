
const API = process.env.REACT_APP_API_BASE || 'https://career-platform-2.onrender.com';

export async function api(path, method = 'GET', body) {
  const token = await window.firebaseAuthToken?.();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getMe() {
  return api('/api/auth/me', 'GET');
}
