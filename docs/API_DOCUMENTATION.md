# PaperMind AI API additions

The API sets a signed HttpOnly session cookie at login; the frontend must send credentials. Unsafe requests require `X-CSRFToken` from `GET /api/auth/csrf/`. Paper endpoints only return data owned by the signed-in user.

## Authentication and password recovery

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/auth/csrf/` | Return a CSRF token and set the CSRF cookie. |
| `POST` | `/api/auth/login/` | Verify credentials and set the HttpOnly session cookie. |
| `POST` | `/api/auth/logout/` | Clear the session cookie. |
| `POST` | `/api/auth/password-reset/` | Request a single-use 6-digit code by email; the response does not disclose whether the account exists. |
| `POST` | `/api/auth/password-reset/confirm/` | Submit `email`, six-digit `code`, and new `password`. Codes expire after 15 minutes and lock after five failed attempts. |

Session cookies are 12 hours, are invalidated by password changes, and are Secure/HttpOnly in production. Production requests require exact HTTPS CORS and CSRF origins, SMTP, Redis-backed rate limiting, and HTTPS proxy settings.

## Account verification

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register/` | Create an inactive account and send a verification email. The response includes a development link only when `DEBUG=True`. |
| `POST` | `/api/auth/verify-email/` | Activate an account with `{"uid":"...","token":"..."}` from the emailed link. |
| `POST` | `/api/auth/verify-email/resend/` | Request another verification email with `{"email":"..."}`. |

In production, configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `DEFAULT_FROM_EMAIL`, and `FRONTEND_URL`. In development, Django prints outgoing messages in the backend console.

## Paper library

| Method | Endpoint | Description |
| --- | --- | --- |
| `PATCH` | `/api/papers/{id}/` | Rename with `{"title":"..."}` or save tags with `{"tags":["vision","survey"]}`. |
| `GET` | `/api/papers/{id}/analysis/` | Load the full saved AI report on demand. The paper library endpoint returns only a compact analysis summary to reduce dashboard load time. |
| `GET` | `/api/papers/{id}/annotations/` | List page-linked notes and highlights. |
| `POST` | `/api/papers/{id}/annotations/` | Create a note: `{"kind":"note","content":"...","page":3}`; or highlight: `{"kind":"highlight","quote":"...","page":3,"color":"yellow"}`. |
| `PATCH`, `DELETE` | `/api/papers/{id}/annotations/{note|highlight}/{annotation_id}/` | Edit note content or delete a note/highlight. |
| `GET` | `/api/papers/{id}/citation/?format={apa|bibtex|ris}` | Download metadata-based citation. |

Upload accepts PDF and Word DOCX only (20 MB maximum per file); image files and legacy `.doc` files are rejected. Oversized files are rejected before extraction. PDF upload attempts OCR for pages with little or no extracted text. Tesseract OCR and language data must be installed on the backend host; `OCR_LANGUAGE` defaults to `eng`.

## Analysis tools

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/analyzer/compare/` | Compare 2–4 owned papers with `{"paper_ids":[1,2]}`. Requires a configured Groq API key. |
| `POST` | `/api/analyzer/{id}/verify/` | Check saved analysis evidence support for exact matches in the extracted source text. |

Evidence verification is a text match check, not a scientific fact check. A paraphrased but valid passage may be marked unverified.
