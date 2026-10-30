const configuredApiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000/api" : "");
const normalizedApiUrl = configuredApiUrl.trim().replace(/\/+$/, "");
export const API_BASE_URL = normalizedApiUrl
  ? (normalizedApiUrl.endsWith("/api") ? normalizedApiUrl : `${normalizedApiUrl}/api`)
  : "";
let csrfToken = "";

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/csrf/`, { credentials: "include", headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Could not reach the PaperMind API. Check VITE_API_URL in Vercel and allow this site's exact origin in the backend CORS settings.");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 404) throw new Error(`CSRF endpoint not found at ${API_BASE_URL}/auth/csrf/. Set VITE_API_URL to your backend host (with or without /api) and redeploy the backend if needed.`);
  if (!response.ok) throw new Error(`The API could not start a secure session (HTTP ${response.status}). Check the backend deployment and logs.`);
  if (!data.csrfToken) throw new Error("The API responded without a CSRF token. Confirm VITE_API_URL points to the current PaperMind backend, then redeploy both services.");
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
