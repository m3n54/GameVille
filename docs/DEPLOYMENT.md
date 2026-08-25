# Deployment Guide — GameVille

Two-service deploy: **frontend on Vercel**, **backend on Render**. Both
require environment variables set in their dashboards (no `.env` file is
shipped to production).

## 1. Backend — Render

The Express + Socket.io server.

### One-time setup
1. Push the repo to GitHub (or GitLab/Bitbucket) and link the repo to Render as
   a new **Web Service**.
2. Render auto-detects `render.yaml` at the repo root. It pins:
   - `rootDir: server`
   - `buildCommand: npm install && npm run build`
   - `startCommand: node dist/server/src/index.js`
   - `healthCheckPath: /health`

### Required environment variables
Set these in **Render Dashboard → Service → Environment**:

| Key           | Value                                                              |
|---------------|--------------------------------------------------------------------|
| `PORT`        | `3001` (Render injects its own; this is a fallback for local)      |
| `CORS_ORIGIN` | `https://gameville.vercel.app,https://*.vercel.app`                |

`CORS_ORIGIN` accepts comma-separated origins. The `https://*.vercel.app`
suffix wildcard is matched by the server's `isOriginAllowed` helper and
covers **every Vercel preview deployment** without enumerating branch URLs.

> **Free-tier cold start**: Render spins the service down after 15 min idle.
> The first request after that takes ~50 s. Plan a warm-up or upgrade the
> instance type before going public.

### Health check
`curl https://<render-app>.onrender.com/health` should return `200 OK`.

## 2. Frontend — Vercel

The Next.js 14 App Router site.

### One-time setup
1. Import the repo into Vercel as a new project.
2. Set **Root Directory** to `frontend` (Vercel auto-detects Next.js).

### Required environment variables
Set these in **Vercel → Project → Settings → Environment Variables** for
**Production**, **Preview**, **AND Development**:

| Key                       | Value                                                  |
|---------------------------|--------------------------------------------------------|
| `NEXT_PUBLIC_SERVER_URL`  | `https://<render-app>.onrender.com`                    |

`NEXT_PUBLIC_*` variables are baked into the JS bundle at build time, so
the value must be set for every environment (or preview builds will fall
back to `http://localhost:3001` and fail to reach the backend).

### Build output
Vercel runs `next build` automatically; the project is configured for
standalone output. No custom build command is required.

## 3. Verifying the deploy

1. Open the Vercel URL → the landing page renders.
2. Click **Buat Ruang Baru** → you should be navigated to `/room/<6-digit>`.
3. Open the same URL in a second browser/profile → join with the PIN.
4. Configure and start any game (try Minesweeper — fastest end-to-end check).
5. Watch the Render logs:
   - `[connection] connect <sid>`
   - `room:create`, `room:join`, `game:start`
   - on disconnect: `disconnect <sid>`

If the second browser cannot join, the most common cause is `CORS_ORIGIN`
missing the preview URL pattern. Update Render and redeploy.

## 4. Free-tier gotchas

- **Render cold start**: ~50 s first request after idle (see above).
- **Vercel preview deployments** get unique hostnames; the `https://*.vercel.app`
  wildcard suffix in `CORS_ORIGIN` handles them automatically.
- **No database**: rooms and games live in-memory. A Render restart wipes
  every active room — expected for the MVP, document for users.
- **WebSocket idle**: Render proxies WebSocket fine; no extra config.

## 5. Rollback

- **Vercel**: Project → Deployments → Promote an older deployment.
- **Render**: Service → Manual Deploy → pick a previous commit.
