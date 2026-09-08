# Volleyball Analytics

React and FastAPI match tracking and analytics for Glasgow University Volleyball Club.

## Local setup

Backend:

```bash
cd volleyball-backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
set -a; source .env; set +a
uvicorn main:app --reload
```

Frontend:

```bash
cd volleyball-frontend
npm install
cp .env.example .env
npm start
```

Environment files and credentials must not be committed. Generate `JWT_SECRET` with a password manager or `openssl rand -hex 32`.

## Production configuration

Configure these Railway variables before deploying the backend:

- `DATABASE_URL` — supplied by Railway PostgreSQL.
- `JWT_SECRET` — a stable, random secret. If omitted, the app uses an ephemeral secret and sessions expire after every restart.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` — bootstrap the administrator and rotate its password at each deployment.
- `CORS_ORIGINS` — comma-separated trusted frontend origins.

Configure `REACT_APP_API_URL` in Vercel to point to the Railway backend. Changing a Create React App environment variable requires a new frontend build.

## Verification

```bash
PYTHONPATH=volleyball-backend pytest -q volleyball-backend/tests
cd volleyball-frontend && npm run build
```
