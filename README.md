<div align="center">

# 📚 PaperMind AI

### *Read less blindly. Understand research more deeply.*

**A private, AI-powered workspace for exploring academic papers.**

Upload a paper, uncover its key ideas, ask evidence-grounded questions, and listen to the analysis—all in one place.

<br />

![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Django](https://img.shields.io/badge/Django-5.2-092E20?style=for-the-badge&logo=django&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-default-003B57?style=for-the-badge&logo=sqlite&logoColor=white)

<br />

**PDF Intelligence** · **Evidence-grounded AI** · **Private by account** · **Listen as you learn**

</div>

---

## 🧭 Contents

- [What it does](#what-it-does)
- [Features](#features)
- [Technology stack](#technology-stack)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [API overview](#api-overview)
- [Data model](#data-model)
- [Security and privacy](#security-and-privacy)
- [Known limitations](#known-limitations)
- [Development commands](#development-commands)

## ✨ What it does

PaperMind AI turns a research PDF into a searchable, reviewable workspace. A user creates an account, uploads a PDF, and PaperMind extracts its selectable text. The user can then request a structured analysis, view evidence and page references, ask questions about the paper, and export the analysis as Markdown. Uploaded papers, saved analyses, and chat history are associated with the account that owns them.

The analysis and chat features use the Groq Chat Completions API with the `openai/gpt-oss-120b` model. Requests include only a limited excerpt of extracted paper text, and prompts instruct the model to avoid unsupported claims.

## 🚀 Features

### 🔐 Accounts

- Register and sign in with email and password.
- Verify email ownership with an expiring verification link before signing in. Configure SMTP for production delivery; development prints messages in the backend console.
- View and update profile details, change password, and delete an account.
- Request a password reset with an emailed 6-digit code that expires after 15 minutes and is single-use.
- Authenticated requests use a signed 12-hour HttpOnly session cookie, bound to the current password hash.

### 📂 Paper library

- Upload PDF or Word DOCX files up to 20 MB; the backend validates the file and extracts text. Images and legacy `.doc` files are rejected.
- PDF files use PyMuPDF and Tesseract OCR for scanned pages when Tesseract is installed.
- Search and filter papers in the library, add searchable tags, rename a paper, preview or download its PDF, and delete it.
- Save and edit page-linked notes and text highlights in the PDF reader.
- Export paper citations as BibTeX, RIS, or an APA-style text citation.
- Keep papers scoped to their owner. Deleting a paper also deletes its uploaded file.

### 🧠 Analysis, chat, and review

- Generate and cache a structured analysis covering objective, problem, methodology, findings, conclusion, limitations, future research, summary, confidence, and evidence.
- Keep the analysis overview focused on paper metadata: topic, authors, year, publication type, datasets and availability, and named models with short explanations. Analysis sections are presented as bullet points.
- Ask questions about a selected paper and retrieve saved question/answer history with evidence.
- Retrieve short, question-relevant passages across the document; chat evidence is marked when its quote matches extracted source text.
- Verify analysis evidence against the extracted paper text, and compare two to four papers across methods, data, findings, and limitations.
- Export a saved analysis as a Markdown report.
- Read a selected passage or the current PDF page with browser text-to-speech, with adjustable playback speed. The in-app reader shows the source PDF beside selectable extracted page text.
- Open paper Q&A in a same-page popup, choose from ten workspace themes, upload a profile image or select one of ten preset icons, and see daily usage quotas.
- Search related papers through Google Scholar, Semantic Scholar, arXiv, or Crossref; search datasets through Kaggle, Hugging Face, UCI, or Zenodo.

Daily usage defaults are 10 PDF uploads and 30 chat messages per account. The backend enforces these limits; the dashboard and chat show current usage.

## 🛠️ Technology stack

| Area | Technologies |
| --- | --- |
| Layer | Stack |
| --- | --- |
| 🎨 Frontend | React 19 · Vite 8 · JavaScript · CSS |
| ⚙️ Backend/API | Python · Django 5.2 · Django REST Framework |
| 📄 PDF processing | PyMuPDF (`fitz`) |
| 🤖 AI | Groq Chat Completions API · `openai/gpt-oss-120b` |
| 🗄️ Database | SQLite by default · PostgreSQL supported |
| 🔊 Voice | Browser Web Speech API (`speechSynthesis`) |
| ☁️ Deployment dependencies | Gunicorn · WhiteNoise · Psycopg · `dj-database-url` |

## 🔄 How it works

### Typical user flow

1. The user registers or signs in. The backend sets a signed HttpOnly session cookie; unsafe API requests also include a CSRF token.
2. The user uploads a PDF. The backend validates the upload, extracts text page by page, labels extracted sections with page numbers, and saves the file and text against the signed-in account.
3. When requested, the analyzer selects up to 30,000 characters of extracted text for Groq. It validates the returned JSON shape and saves the analysis on the paper so later requests can use the cached result.
4. For paper chat, the backend retrieves up to 9,000 characters of question-relevant text, then stores the answer and evidence as chat history.
5. The frontend displays the result, opens the source PDF through an authenticated endpoint, exports a Markdown report, or reads saved analysis with the browser's English voice.

### 🗺️ Flow chart

```mermaid
flowchart TD
    A[User] --> B[React and Vite app]
    B -->|HttpOnly cookie + CSRF protected requests| C[Django REST API]
    C --> D{Authenticated and owns resource?}
    D -->|No| E[Return authorization or validation error]
    D -->|Yes| F{Requested operation}
    F -->|Upload PDF| G[Validate PDF and extract text with PyMuPDF]
    G --> H[(Database: paper, extracted text)]
    G --> I[(Media storage: PDF)]
    F -->|Analyze paper| J{Saved analysis exists?}
    J -->|Yes| K[Return cached analysis]
    J -->|No| L[Groq API: structured analysis]
    L --> H
    F -->|Ask a question| M[Groq API: paper-grounded answer]
    M --> N[(Database: chat history and evidence)]
    H --> O[Paper list, details, PDF, and saved results]
    K --> B
    N --> B
    O --> B
    B --> P[Markdown export or browser text-to-speech]
```

## 🏗️ Architecture

```text
Browser
  React UI (frontend/src/App.jsx)
      │ fetch + HttpOnly cookie + X-CSRFToken
      ▼
  Django REST Framework API (backend)
      ├── common     account endpoints and token authentication
      ├── papers     PDF upload, extraction, library, and file access
      ├── analyzer   Groq analysis and cached results
      └── chat       paper Q&A and persisted conversation history
             │                         │
             ▼                         ▼
       SQLite/PostgreSQL        Groq Chat Completions API
       PDF media files          (analysis and question answering)
```

The frontend uses a small API helper in `frontend/src/services/api.js` to attach the configured API base URL, HttpOnly-cookie credentials, and CSRF header for unsafe requests. Django's URL configuration mounts each feature under `/api/`. The backend's default REST permission is authenticated; registration, login, password reset, and status endpoints explicitly allow unauthenticated access where needed.

## 🗂️ Repository structure

```text
PaperMind-AI/
├── README.md                     Project documentation
├── requirements.txt              Python dependencies
├── docs/
│   ├── API_DOCUMENTATION.md       Detailed API reference
│   └── FEATURES.md               Feature notes
├── backend/
│   ├── manage.py                 Django management entry point
│   ├── config/                   Django settings, root URLs, ASGI and WSGI
│   ├── common/                   Accounts, password reset, token authentication
│   ├── papers/                   Paper model, PDF upload/extraction and endpoints
│   ├── analyzer/                 Analysis endpoint, model, and Groq service
│   ├── chat/                     Chat endpoint, model, and serializers
│   ├── media/                    Uploaded PDFs (created/populated at runtime)
│   ├── .env                      Local secrets and environment configuration
│   └── db.sqlite3                 Local SQLite database (created at runtime)
└── frontend/
    ├── package.json              Frontend dependencies and scripts
    ├── index.html                Vite HTML entry point
    ├── vite.config.js             Vite configuration
    ├── src/
    │   ├── main.jsx               React entry point
    │   ├── App.jsx                Screens, app state, and user flows
    │   ├── App.css                Application styles
    │   ├── index.css              Global styles
    │   ├── services/api.js        API base URL, token, and fetch helper
    │   └── assets/                Frontend image assets
    └── public/                    Static public assets
```

Each Django feature app also contains its `models.py`, `views.py`, `serializers.py` where used, `urls.py`, `tests.py`, and migrations. The `frontend/dist/` directory is generated by a production build and does not need to be edited by hand. Local database and uploaded media contents are runtime data, not source code.

## ⚡ Getting started

### Prerequisites

- Python 3.10 or newer (Django 5.2 requires Python 3.10+).
- Node.js and npm compatible with the installed Vite version.
- A Groq API key for AI analysis and paper chat.

### 1️⃣ Configure the backend

From the repository root, create `backend/.env`:

```dotenv
DJANGO_SECRET_KEY=replace-with-a-long-random-secret
DJANGO_DEBUG=True
GROQ_API_KEY_1=your-groq-api-key
# Optional fallback key:
# GROQ_API_KEY_2=your-second-groq-api-key

# Optional; defaults to backend/db.sqlite3.
# Example PostgreSQL URL:
# DATABASE_URL=postgresql://user:password@localhost:5432/papermind

# Account email links and verification.
FRONTEND_URL=http://localhost:5173
```

`backend/.env` is loaded by Django settings and should remain private. Do not commit real secrets.

### 2️⃣ Install backend dependencies and start Django

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r ..\requirements.txt
python manage.py migrate
python manage.py runserver
```

The API is available at `http://127.0.0.1:8000/api/`. The health endpoint is `http://127.0.0.1:8000/api/health/`.

### 3️⃣ Install frontend dependencies and start Vite

Open a second terminal at the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The frontend defaults to `http://localhost:8000/api` for the backend. To use a different API host, create `frontend/.env.local`:

```dotenv
VITE_API_URL=http://localhost:8000/api
```

Create an account, upload a PDF, then request analysis or choose the paper in AI Chat. Scanned pages require Tesseract OCR installed and available on `PATH` (set `OCR_LANGUAGE` to select its language code). Analysis, chat, and comparison require a valid Groq key and an internet connection.

## 🔧 Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Production | Django signing and security secret. A local-only fallback exists in settings; always set a private value for deployment. |
| `DJANGO_DEBUG` | Production | Must be `False` for public deployment; Render startup fails closed if it is enabled. |
| `GROQ_API_KEY_1` | For AI | Primary key for paper analysis and chat. |
| `GROQ_API_KEY_2` | No | Optional second key attempted when the first analysis/chat request fails. |
| `OCR_LANGUAGE` | No | Tesseract language code for scanned PDF pages; defaults to `eng`. Install the matching Tesseract language data. |
| `DATABASE_URL` | No | Database URL; omitted means SQLite at `backend/db.sqlite3`. PostgreSQL URLs are supported. |
| `FRONTEND_URL` | Production | Exact HTTPS frontend origin used for account emails and CORS configuration. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS` | Production email | SMTP settings for verification and password-reset delivery. |
| `DEFAULT_FROM_EMAIL` | No | Sender address used for account emails. |
| `REDIS_URL` | Production | Shared Redis cache required for distributed API rate limits. |
| `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS`, `TRUST_PROXY_SSL_HEADER` | Production | HTTPS/HSTS and reverse-proxy configuration; Render proxy trust is detected from its service hostname. |
| `VITE_API_URL` | No | Frontend API base URL; defaults to `http://localhost:8000/api`. |

`ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` are configurable with environment variables. Set `CORS_ALLOWED_ORIGINS` to the deployed frontend origin(s), comma-separated, and `ALLOWED_HOSTS` to the backend host. Configure a real email backend for password reset email delivery in deployment.

### Deploy frontend to Vercel and backend to Render

These are separate services. The frontend must be told the public backend API URL; otherwise production builds cannot use the local development API.

**Vercel** (project root: `frontend`; build command: `npm run build`; output directory: `dist`): add this Production environment variable, using the public URL shown on your Render web service:

```dotenv
VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api
```

Redeploy the Vercel project after changing environment variables.

**Render** (web service root: repository root `.`; build command: `pip install -r requirements.txt`; start command: `cd backend && python manage.py migrate && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --worker-class sync`): configure these environment variables:

```dotenv
DJANGO_SECRET_KEY=<a long random secret>
DJANGO_DEBUG=False
ALLOWED_HOSTS=YOUR-RENDER-SERVICE.onrender.com
CORS_ALLOWED_ORIGINS=https://paper-mind-ai-git-main-sayed-tauhidul-islams-projects.vercel.app
FRONTEND_URL=https://paper-mind-ai-git-main-sayed-tauhidul-islams-projects.vercel.app
REDIS_URL=<your private TLS-enabled Redis URL>
EMAIL_HOST=<your SMTP host>
EMAIL_PORT=587
EMAIL_HOST_USER=<your SMTP username>
EMAIL_HOST_PASSWORD=<your SMTP password>
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=PaperMind AI <noreply@your-domain.example>
GROQ_API_KEY_1=<your Groq API key>
DATABASE_URL=<your Render PostgreSQL connection URL>
```

Use the actual Render service hostname and the Vercel production domain assigned to your project. Add any other active Vercel domain to `CORS_ALLOWED_ORIGINS`, separated by commas. A persistent PostgreSQL database is recommended; Render's local filesystem and SQLite database are not reliable persistent storage for production user data or uploaded PDFs.

PDF/DOCX extraction runs synchronously. The documented single synchronous Gunicorn worker intentionally processes **one upload at a time per service instance**; additional requests wait for that worker. The account limit is 10 uploads per day, but that is not a concurrency limit. Do not increase worker count based on guesswork: each worker can hold an uploaded file and extracted page data in memory. For higher throughput, move extraction to a Redis-backed background queue and set its worker count after load testing the actual hosting plan.

## 🔌 API overview

All API routes are prefixed with `/api`. Sign-in sets an HttpOnly cookie. For unsafe requests, first call `GET /auth/csrf/` and send its `csrfToken` value as `X-CSRFToken`; browser clients must include credentials:

```http
Cookie: __Host-papermind_session=<HttpOnly session>
X-CSRFToken: <csrfToken returned by /auth/csrf/>
```

| Method | Endpoint | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/health/` | Backend health status | Public |
| `POST` | `/auth/register/` | Create account | Public |
| `POST` | `/auth/login/` | Sign in | Public |
| `GET` | `/auth/csrf/` | Get a CSRF token for protected mutations | Public |
| `POST` | `/auth/logout/` | Clear the session cookie | Public + CSRF |
| `GET` | `/auth/usage/` | Read today's PDF-upload and chat-message usage | Authenticated |
| `GET`, `PATCH` | `/auth/profile/` | Read or update profile | Authenticated |
| `POST` | `/auth/password/` | Change password | Authenticated |
| `POST` | `/auth/password-reset/` | Email a 6-digit reset code | Public + rate limited |
| `POST` | `/auth/password-reset/confirm/` | Set password using email, code, and new password | Public + rate limited |
| `DELETE` | `/auth/account/` | Delete account and owned data | Authenticated |
| `GET`, `POST` | `/papers/` | List papers or upload PDF | Authenticated |
| `GET`, `PATCH`, `DELETE` | `/papers/{id}/` | Read, rename, or delete a paper | Authenticated owner |
| `GET` | `/papers/{id}/file/` | Preview/download source PDF | Authenticated owner |
| `GET` | `/analyzer/` | Analyzer status | Authenticated |
| `POST` | `/analyzer/{id}/analyze/` | Analyze a paper or return cached analysis | Authenticated owner |
| `GET` | `/chat/` | Chat service status | Authenticated |
| `GET`, `POST` | `/chat/{id}/` | Read history or ask about a paper | Authenticated owner |

For request/response examples and field details, see [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md). Product scope is summarized in [docs/FEATURES.md](docs/FEATURES.md).

## 🧩 Data model

```mermaid
erDiagram
    USER ||--o{ PAPER : owns
    USER ||--o{ CHAT_MESSAGE : sends
    PAPER ||--o{ CHAT_MESSAGE : has
    USER {
        int id
        string email
        string password_hash
    }
    PAPER {
        int id
        int owner_id
        string title
        file pdf
        text extracted_text
        json analysis_result
        datetime uploaded_at
    }
    CHAT_MESSAGE {
        int id
        int owner_id
        int paper_id
        text question
        text answer
        json evidence
        datetime created_at
    }
```

Analysis is stored as JSON on the paper record; chat messages and evidence are stored separately. User and paper relationships are checked by the API before accessing private resources.

## 🛡️ Security and privacy

- Passwords are handled through Django's authentication and password validation system.
- API access uses a signed, HttpOnly session cookie with a 12-hour maximum age; sessions are bound to the current password hash and become invalid after a password reset/change. Unsafe requests require a CSRF token.
- Login, registration, verification-resend, and password-reset endpoints have rate limits. Production limits use shared Redis, not per-process memory.
- Password recovery emails a random six-digit code. Only its password hash is stored; codes expire after 15 minutes, allow five attempts, and are single-use.
- Paper, PDF, analysis, and chat endpoints scope lookups to the authenticated owner.
- PDF and DOCX uploads are each limited to 20 MB. PDFs are limited to 500 pages and must have a PDF signature; DOCX archives are bounded before XML extraction.
- API responses use no-store caching and restrictive security headers. Vercel deployment adds a Content Security Policy, HSTS, and browser permission restrictions.
- AI provider keys are read by the backend from environment variables; they should never be placed in frontend configuration.
- The browser does not store the session token in JavaScript-readable storage. Use a custom domain for the frontend and API under the same registrable domain in production; Vercel and Render default domains are cross-site and some browsers block cross-site cookies.
- Set `DJANGO_DEBUG=False`, a strong `DJANGO_SECRET_KEY`, production host/CORS settings, and a production database before exposing the service publicly.

## 🚧 Known limitations

- OCR requires an external Tesseract installation and matching language data; scanned documents with poor image quality can still extract imperfect text.
- Analysis and chat retrieve selected page-aware excerpts. Very long papers can still contain relevant details outside the retrieved context.
- AI analysis and chat require a working Groq API key and network connection.
- Voice playback uses the browser's English text-to-speech voice; Bengali speech is not implemented.
- Citation exports are drafts based on paper metadata detected from the PDF and analysis; review missing author, year, venue, and DOI details before publication.
- Report export is Markdown; PDF-formatted report export is not implemented.
- Production account recovery needs working SMTP and DNS/email deliverability (SPF, DKIM, and DMARC) for the sender domain. Production startup requires exact HTTPS host/origin settings, a strong secret, SMTP sender, and Redis. Configure persistent private file storage and a production database for deployment.

## 💻 Development commands

Run these from `frontend/`:

```bash
npm run dev       # Start Vite development server
npm run build     # Create the production frontend bundle in dist/
npm run preview   # Preview the production bundle locally
npm run lint      # Run ESLint
```

Run these from `backend/`:

```bash
python manage.py runserver       # Start the Django development server
python manage.py migrate         # Apply database migrations
python manage.py createsuperuser # Create a Django admin account
python manage.py test            # Run backend tests
```

`python manage.py test` is listed as a development command; this README update does not imply that the test suite was run.
