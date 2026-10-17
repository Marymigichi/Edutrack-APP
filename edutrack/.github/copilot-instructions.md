# GradePal project notes

- GradePal is a React + Vite frontend and Express API backed by SQLite.
- Start development with `npm run dev`; run the production client build with `npm run build`.
- Keep student grade access read-only in the API. Only teacher-authenticated routes may write grades, and teacher ownership/enrollment must be checked server-side.
- Keep teacher-to-teacher conversations unavailable to student accounts.
