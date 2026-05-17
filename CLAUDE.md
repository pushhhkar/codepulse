# CodePulse — Claude guidance

## Project overview

Real-time collaborative code review platform. Turborepo monorepo split into four packages:

| Package | Purpose |
|---|---|
| `packages/types` | Shared TypeScript interfaces (User, Workspace, CodeSnippet, socket event maps) |
| `packages/config` | Shared ESLint, Prettier, and TSConfig presets |
| `apps/server` | Express + Socket.io + Mongoose — runs on port 5000 |
| `apps/web` | Next.js 15 App Router + Tailwind + Monaco Editor — runs on port 3000 |

## Running the project

```bash
# 1. Copy env files and fill in values (GitHub OAuth credentials, MongoDB URI, JWT secret)
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example    apps/web/.env.local

# 2. Install all dependencies from the repo root
npm install

# 3. Start everything concurrently
npm run dev          # runs: turbo run dev
```

`npm run dev` starts all four packages via Turborepo's concurrent dev pipeline.

## TypeScript rules — strictly enforced

- **`any` is banned.** `@typescript-eslint/no-explicit-any` is set to `error`.
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns` are all enabled.
- Use `satisfies` over casting where possible.
- All new code must pass `npx tsc --noEmit` with zero errors before being considered done.

## Architecture decisions to preserve

### Auth
- JWT is issued as an `httpOnly` cookie — it is **never** sent to or readable by the browser's JavaScript.
- `getServerUser()` in `apps/web/src/lib/auth.ts` reads the cookie server-side inside Next.js Server Components. Never fetch `/auth/me` from client-side code.
- Protected pages: call `getServerUser()` at the top of the Server Component and `redirect('/')` if it returns `null`.

### Socket.io
- Event types live in `packages/types/src/socket.ts` as `ClientToServerEvents` and `ServerToClientEvents`. **All new events must be added there first** before implementing them on either side.
- The server's `Server<>` and the client's `Socket<>` are both typed with those interfaces — a misspelled event name is a compile error.
- `SocketProvider` is mounted once in the root layout. Use `useSocket()` to access the socket anywhere in client components.
- `socket.emit('JOIN_WORKSPACE', { workspaceId })` is fired in a `useEffect` that guards on `status === 'connected'`.

### Next.js component rules
- Server Components are the default. Mark a component `'use client'` only when it needs browser APIs, state, effects, or socket access.
- Monaco Editor (`CollaborativeEditor`) and `SocketProvider` are `'use client'`. The page files under `/workspace/[id]` and `/dashboard` are Server Components.
- Params in Next.js 15 App Router are `Promise<{ id: string }>` — always `await params`.

### Mongoose models
- Each model file extends the shared type via `Omit<SharedType, 'id'> & Document`.
- `toJSON.transform` maps `_id` → `id` and deletes `__v` using `Record<string, unknown>` typed `ret` to satisfy strict TS.
- ObjectId fields are converted with `String(ret['fieldName'])` inside the transform.

## Monorepo commands

```bash
npm run dev          # turbo run dev (all packages, concurrent)
npm run build        # turbo run build (respects dependency order)
npm run lint         # turbo run lint
npm run format       # prettier --write across the repo

# Per-package type-checks
cd packages/types  && npx tsc --noEmit
cd apps/server     && npx tsc --noEmit
cd apps/web        && npx tsc --noEmit

# Rebuild shared types (required after editing packages/types/src)
cd packages/types  && npx tsc --project tsconfig.json
```

## Sandbox execution architecture

- Docker image tag: `codepulse-sandbox:latest` (built from `docker/sandbox/Dockerfile`).
- Build command: `docker build -t codepulse-sandbox:latest ./docker/sandbox`
- All execution goes through `apps/server/src/services/sandbox.ts` → `executeCode()`.
- The route is `POST /api/sandbox/execute`, protected by `requireAuth`.
- Security flags enforced per-container: `--network none`, `--memory 128m`, `--cpus 0.5`, `--pids-limit 64`, `--read-only`, `--tmpfs /tmp`, `--user nobody`.
- `execFile` is used (not `exec`) — no shell involved, no injection surface in argv.
- Temp files live in `os.tmpdir()` with a UUID prefix, deleted in a `finally` block.
- Timeout (`SANDBOX_TIMEOUT_MS`, default 10 s) is enforced via `Promise.race`; timed-out containers are killed by name.

## Phase roadmap

- **Phase 1** (done): Monorepo scaffold, auth, shared types, Mongoose schemas.
- **Phase 2A** (done): Socket.io infrastructure, Monaco Editor rendering, `JOIN_WORKSPACE` event.
- **Phase 2B** (done): Real-time code syncing (`CODE_CHANGE`), ghost cursors (`CURSOR_MOVE`).
- **Phase 3A** (done): Docker sandbox execution — `POST /api/sandbox/execute` for JS and C++.
- **Phase 3B** (next): Frontend execution UI — run button, output panel, language selector in the workspace.
- **Phase 4**: Inline comments, workspace management UI, persistence of snapshots to MongoDB.
