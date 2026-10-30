export const API_BASE_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000/api" : "")).replace(/\/$/, "");
let csrfToken = "";

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${API_BASE_URL}/auth/csrf/`, { credentials: "include", headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.csrfToken) throw new Error("Could not establish a secure request session. Refresh and try again.");
  csrfToken = data.csrfToken;
  return csrfToken;
}

export async function apiFetch(path, options = {}) {
  if (!API_BASE_URL) throw new Error("The API URL is not configured. Set VITE_API_URL in the Vercel project settings and redeploy.");
  const method = String(options.method || "GET").toUpperCase();
  const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options.headers };
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) headers["X-CSRFToken"] = await getCsrfToken();
  return fetch(`${API_BASE_URL}${path}`, { ...options, method, credentials: "include", headers });
}

export async function api(path, options = {}) {
  const response = await apiFetch(path, options);
  if (response.status === 204) return null;
  const responseText = await response.text();
  let data = {};
  try { data = responseText ? JSON.parse(responseText) : {}; } catch { /* Keep HTML error pages out of the UI. */ }
  if (!response.ok) {
    // Django's analyzer endpoint includes the upstream provider response in
    // `details`; preserve it so users can distinguish quota, key, and timeout
    // failures from an application error.
    const message = [data.error || data.detail, data.details]
      .filter(Boolean)
      .join(" — ");
    const fallback = response.status === 404
      ? `API endpoint not found (404) for ${path}. Restart or redeploy the backend so its routes match this frontend.`
      : response.status >= 500
        ? `The server returned an error (${response.status}) for ${path}. Check backend logs and confirm database migrations have been applied.`
        : `Request failed (${response.status}) for ${path}. Please check the details and try again.`;
    throw new Error(message || fallback);
  }
  return data;
}
