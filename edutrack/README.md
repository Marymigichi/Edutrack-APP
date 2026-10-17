# GradePal

A mobile-first grade tracker MVP with separate teacher and student experiences, persistent SQLite data, server-enforced grade permissions, progress charts, and a friendly study helper.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set `JWT_SECRET` to a long random value.
4. Run `npm run dev` and open `http://localhost:5173`.

The API runs on port 3001 and creates `gradepal.db` on first start. Demo accounts:

- Teacher: `alex@gradepal.school` / `teach123`
- Student: `maya@gradepal.school` / `learn123`

The database is seeded only when created; restarting the API preserves changes. Do not use the demo credentials or fallback configuration for production. Before production, use a managed database, HTTPS, secure cookie or token storage, rate limiting, account provisioning, and a reviewed deployment secret. The development MVP stores the JWT in browser local storage.

## Checks

- `npm run build` builds the client.
- `npm start` runs the API and serves the built client when available.

Student tokens are rejected by grade mutation routes on the server. Teacher changes are checked against the teacher's assigned subjects and students.
