const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
export const token = () => localStorage.getItem("papermind-token");
export async function api(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...options.headers };
  const response = await fetch(`${API}${path}`, { ...options, headers });
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
