# ERP Base — JWT Auth Scaffold

## Structure
```
erp-crash/
  backend/   Express + MongoDB + JWT
  frontend/  Next.js (App Router)
```

## Backend setup (PostgreSQL + Prisma)
```
cd backend
npm install
# update DATABASE_URL in .env to point at your Postgres instance first
npm run prisma:migrate    # creates the User table
npm run prisma:generate   # regenerate client after any schema change
npm run dev
```
Endpoints:
- POST /api/auth/register  { name, email, password, role? }
- POST /api/auth/login     { email, password }
- GET  /api/auth/me        (Bearer token)
- GET  /api/dashboard      (Bearer token, protected example)

## Frontend setup
```
cd frontend
npm install
npm run dev         # runs on http://localhost:3000
```
- /login writes the JWT to localStorage and calls the backend.
- /dashboard is client-protected: no token -> redirect to /login.

## Before you show this to your manager
- Rotate JWT_SECRET in backend/.env, don't ship the placeholder.
- localStorage token storage is fine for a crash demo but is XSS-exposed —
  if this becomes real, move to httpOnly cookies + refresh tokens.
- No role-based UI gating yet, only the `authorize()` middleware exists server-side.

## Deploy
Pushes to `main` deploy to Cloudflare Workers (Workers Builds, see `wrangler.jsonc`).
