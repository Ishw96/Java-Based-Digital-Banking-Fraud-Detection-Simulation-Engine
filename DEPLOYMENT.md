# DetectIQ Packaging

## Enterprise Compose Flow
1. Copy [`.env.example`](D:/EclipseProrams/InfoS_Project/.env.example) to `.env`.
2. Replace the example database credentials and leave bootstrap-admin provisioning disabled unless you are doing a one-time first boot with explicit credentials.
3. Start the packaged stack:

```powershell
docker compose --env-file .env -f docker-compose.enterprise.yml up --build
```

## What This Starts
- `frontend`: static React build behind Nginx with proxy routes for `/api`, `/ws`, and `/ml`
- `backend`: Spring Boot API with env-driven secrets and runtime URLs
- `ml-engine`: FastAPI scoring service with model/runtime metadata from environment
- `mysql`: MySQL persistence for platform state

## Runtime Contract
- Frontend public entrypoint: `http://localhost:3000`
- API base path: `/api/v1`
- WebSocket/SockJS path: `/ws`
- ML proxy path: `/ml`

## Production Notes
- Keep `APP_BOOTSTRAP_ADMIN_ENABLED=false` by default, and only turn it on briefly for first-time provisioning with explicit credentials.
- Override all example passwords and mail settings through `.env` or your deployment secret store.
- The backend no longer relies on hardcoded Gmail credentials or personal bootstrap admin values.
