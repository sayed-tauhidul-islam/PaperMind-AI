export const API_BASE_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000/api" : "")).replace(/\/$/, "");
export const token = () => localStorage.getItem("papermind-token");
export async function api(path, options = {}) {
  if (!API_BASE_URL) throw new Error("The API URL is not configured. Set VITE_API_URL in the Vercel project settings and redeploy.");
  const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...options.headers };
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Django's analyzer endpoint includes the upstream provider response in
    // `details`; preserve it so users can distinguish quota, key, and timeout
    // failures from an application error.
    const message = [data.error || data.detail, data.details]
      .filter(Boolean)
      .join(" — ");
    throw new Error(message || "Request failed. Please try again.");
  }
  return data;
}
