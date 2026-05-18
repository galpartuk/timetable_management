# Timetable Management

School timetable planning + scheduling system. Three surfaces in one repo:

| Directory | Stack | Audience |
|---|---|---|
| [`backend/`](backend/) | Django 6 + DRF + OR-Tools | API for everyone; admin via /admin/ |
| [`frontend/`](frontend/) | React 19 + Vite + TypeScript + MUI | Web admin surface — full editing, imports, AI assistant |
| [`mobile/`](mobile/) | Flutter 3 + Riverpod | iOS + Android app — teachers, students, admins |

Production: <https://timetable.all-good.co.il/>

---

## What's where

### `backend/` — Django

The brains. Owns the data model, the CP-SAT solver, the Excel
importer/exporter, REST endpoints, and the AI assistant. Deployed to
`10.0.0.198` via docker-compose; a GitHub webhook rebuilds containers
on every push to `main`.

Key apps:
- `apps.users` — auth (Google SSO + phone OTP + password), token + session
- `apps.school`, `apps.subjects`, `apps.scheduling` — domain model
- `apps.import_export` — Excel ↔ DB
- `apps.ai_assistant` — Claude tool-use
- `solver/` — OR-Tools timetable solver

Local dev: `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python manage.py migrate && python manage.py runserver`

### `frontend/` — React

The full admin surface: Excel import with dry-run + diff, quality
dashboard with the per-teacher windows table, constraint editor,
drag-and-drop timetable editing, AI assistant chat. Hebrew RTL,
Material UI, deployed as a static SPA behind Caddy.

Local dev: `cd frontend && npm install && npm run dev` (proxies /api to
the backend on :8000 via vite.config.ts).

### `mobile/` — Flutter

iOS + Android companion app for teachers, students, and admins:

- **Today** — hero card "next lesson at X" + remaining-today list
- **Week** — full RTL 5×10 grid, tap any day for the Day View
- **Day** — vertical lesson list with start/end times
- **Admin** (admins only) — quality KPIs + run-solver + teacher windows
- **Settings** — language toggle (he/en), logout

Offline support: schedules cached via Hive; stale data shown with a
banner when the device is offline.

Local dev requires:
- Flutter 3.24+ (`brew install flutter`)
- Xcode 15+ for iOS
- Android Studio + SDK API 34+ for Android
- `cd mobile && flutter pub get && flutter run`

Token-based API auth: the backend issues a Token on login
(`/api/auth/login/`, `/api/auth/google/`, `/api/auth/verify-otp/`) which
the app sends as `Authorization: Token <key>`.

---

## Deployment

- **Web (backend + frontend)**: GitHub webhook hits the deploy-hook
  container, which fetches `main` and runs `docker compose build &&
  up -d`. Tied to the `main` branch only.
- **Mobile**: tag `mobile-v0.1.0` triggers a Codemagic build (see
  `codemagic.yaml`) which publishes to TestFlight + Play Internal track.
  Web pushes don't trigger mobile builds.

The mobile pipeline needs these Codemagic env vars to be set once:

- `APP_STORE_CONNECT_PRIVATE_KEY`, `APP_STORE_CONNECT_KEY_ID`,
  `APP_STORE_CONNECT_ISSUER_ID` — from Apple Developer.
- `CM_KEYSTORE` (base64), `CM_KEYSTORE_PASSWORD`, `CM_KEY_ALIAS`,
  `CM_KEY_PASSWORD` — Play upload keystore.
- `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` — Play Console service account.
- `GOOGLE_CLIENT_ID_IOS`, `GOOGLE_CLIENT_ID_ANDROID` — separate OAuth
  clients for the mobile app (the web client lives in backend `.env`).

---

## Conventions

- Hebrew is the default UI language; English is supported.
- All admin-style copy uses the same Hebrew terms across web + mobile.
- The Excel format we import is documented inline in
  `backend/apps/import_export/parser.py`.
- Solver design + objective rationale: `backend/solver/SCHEDULING_NOTES.md`.

## Tests

- Backend: `cd backend && python manage.py test apps`
- Mobile: `cd mobile && flutter test`
- Frontend: `cd frontend && npx tsc --noEmit && npx vite build` (no
  unit tests yet)
