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
- View and update profile details, change password, and delete an account.
- Request a password reset. In development, reset credentials are returned by the API; in production, the backend attempts to email the reset details.
- Authenticated requests use a signed bearer token with a 30-day maximum age.

### 📂 Paper library

- Upload PDF files up to 20 MB; the backend checks the PDF signature and extracts selectable text with PyMuPDF.
- Search and filter papers in the library, rename a paper, preview or download its PDF, and delete it.
- Keep papers scoped to their owner. Deleting a paper also deletes its uploaded file.

### 🧠 Analysis, chat, and review

- Generate and cache a structured analysis covering objective, problem, methodology, findings, conclusion, limitations, future research, summary, confidence, and evidence.
- Keep the analysis overview focused on paper metadata: topic, authors, year, publication type, datasets and availability, and named models with short explanations. Analysis sections are presented as bullet points.
- Ask questions about a selected paper and retrieve saved question/answer history with evidence.
- Export a saved analysis as a Markdown report.
- Read a selected passage or the current PDF page with browser text-to-speech, with adjustable playback speed. The in-app reader shows the source PDF beside selectable extracted page text.
- Open paper Q&A in a same-page popup, choose from five workspace themes, upload a profile image or select one of ten preset icons, and see daily usage quotas.
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

1. The user registers or signs in. The frontend stores the returned bearer token in browser `localStorage` and sends it with authenticated API requests.
2. The user uploads a PDF. The backend validates the upload, extracts text page by page, labels extracted sections with page numbers, and saves the file and text against the signed-in account.
3. When requested, the analyzer sends up to 18,000 characters of extracted text to Groq. It validates the returned JSON shape and saves the analysis on the paper so later requests can use the cached result.
4. For paper chat, the backend sends the question and up to 18,000 characters of that paper's text to Groq, then stores the answer and evidence as chat history.
5. The frontend displays the result, opens the source PDF through an authenticated endpoint, exports a Markdown report, or reads saved analysis with the browser's English voice.

### 🗺️ Flow chart

```mermaid
flowchart TD
    A[User] --> B[React and Vite app]
    B -->|Bearer token + JSON or PDF| C[Django REST API]
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
      │ fetch + Authorization: Bearer <token>
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

The frontend uses a small API helper in `frontend/src/services/api.js` to attach the configured API base URL and bearer token. Django's URL configuration mounts each feature under `/api/`. The backend's default REST permission is authenticated; registration, login, password reset, and status endpoints explicitly allow unauthenticated access where needed.

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

# Used to compose password-reset email details when DEBUG is False.
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

Open the local URL printed by Vite (normally `http://localhost:5173`). The frontend defaults to `http://127.0.0.1:8000/api` for the backend. To use a different API host, create `frontend/.env.local`:

```dotenv
VITE_API_URL=http://127.0.0.1:8000/api
```

Create an account, upload a selectable-text PDF, then request analysis or choose the paper in AI Chat. Analysis and chat require a valid Groq key and an internet connection.

## 🔧 Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Production | Django signing and security secret. A local-only fallback exists in settings; always set a private value for deployment. |
| `DJANGO_DEBUG` | No | Defaults to `True`; set to `False` for deployment. Password reset codes are exposed in the response only in debug mode. |
| `GROQ_API_KEY_1` | For AI | Primary key for paper analysis and chat. |
| `GROQ_API_KEY_2` | No | Optional second key attempted when the first analysis/chat request fails. |
| `DATABASE_URL` | No | Database URL; omitted means SQLite at `backend/db.sqlite3`. PostgreSQL URLs are supported. |
| `FRONTEND_URL` | No | Frontend address inserted into production password-reset email text; defaults to localhost. |
| `VITE_API_URL` | No | Frontend API base URL; defaults to `http://127.0.0.1:8000/api`. |

The checked-in Django settings currently allow `localhost` and `127.0.0.1` as hosts and allow the local Vite origins for CORS. Update `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` in `backend/config/settings.py` for your deployed domains. Configure a real email backend for password reset email delivery in deployment.

## 🔌 API overview

All API routes are prefixed with `/api`. Most endpoints require:

```http
Authorization: Bearer <token>
```

| Method | Endpoint | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/health/` | Backend health status | Public |
| `POST` | `/auth/register/` | Create account | Public |
| `POST` | `/auth/login/` | Sign in | Public |
| `GET` | `/auth/usage/` | Read today's PDF-upload and chat-message usage | Authenticated |
| `GET`, `PATCH` | `/auth/profile/` | Read or update profile | Authenticated |
| `POST` | `/auth/password/` | Change password | Authenticated |
| `POST` | `/auth/password-reset/` | Request reset instructions | Public |
| `POST` | `/auth/password-reset/confirm/` | Set password using reset UID/token | Public |
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
- API access uses signed tokens with a maximum age of 30 days; tokens are sent in the `Authorization` header.
- Paper, PDF, analysis, and chat endpoints scope lookups to the authenticated owner.
- PDF uploads are limited to 20 MB and must have a PDF signature and extractable text.
- AI provider keys are read by the backend from environment variables; they should never be placed in frontend configuration.
- The frontend currently stores its bearer token in browser `localStorage`. Use HTTPS in deployment and protect the browser session accordingly.
- Set `DJANGO_DEBUG=False`, a strong `DJANGO_SECRET_KEY`, production host/CORS settings, and a production database before exposing the service publicly.

## 🚧 Known limitations

- Scanned/image-only PDFs are rejected; OCR is not implemented.
- Analysis and chat select page-aware excerpts from across the PDF (up to 30,000 characters each). Very long papers can still exceed the context inspected by the model.
- AI analysis and chat require a working Groq API key and network connection.
- Voice playback uses the browser's English text-to-speech voice; Bengali speech is not implemented.
- Multi-paper comparison and Google sign-in are not implemented.
- Report export is Markdown; PDF-formatted report export is not implemented.
- Production password reset needs a configured Django email backend. The current production path sends reset UID/token details in an email body, while debug mode returns them directly in the API response.
- Deployment settings are not fully production-ready out of the box: configure hosts, CORS, email, static/media storage, secrets, and database for your environment.

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
