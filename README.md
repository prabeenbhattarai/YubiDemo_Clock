# Clockwise — Clock-in & Timesheet Platform

Geofenced clock-in, live workforce tracking, and timesheet approvals.
**Next.js (App Router) + Firebase (Firestore / Auth / Storage) + Google Maps.**

- **Admin console** (`/admin`) — sites, workers, live monitor, approvals.
- **Worker app** (`/worker`) — mobile, app-like: clock-in/out with photo + geofence, manual timesheets, history, profile.
- **Login** (`/login`) — passwordless email one-time code (OTP) for both roles.

Runs fully locally on the **Firebase Emulator Suite** — no cloud project or billing needed to develop.

---

## 1. Prerequisites

- Node 18+ (tested on Node 22)
- Java 11+ (for the Firestore/Storage emulators — `java -version`)
- A Google Maps Platform API key (optional for dev; the app falls back to manual lat/lng without it)

## 2. Configure environment

Edit **`.env.local`** (already created). The only thing you must set for maps to work:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
GOOGLE_MAPS_SERVER_KEY=your_key_here      # used for server-side geofence region checks
```

Enable these APIs on the key in Google Cloud Console:
**Maps JavaScript API**, **Places API**, **Geocoding API**.

Who is an admin is controlled by:

```bash
ADMIN_EMAILS=admin@example.com,you@company.com
```

Any email **not** in that list that a worker was registered with signs in as a worker.

## 3. Run it (two terminals)

```bash
# Terminal 1 — Firebase emulators (Auth, Firestore, Storage)
npm run emulators

# Terminal 2 — the app
npm run dev
```

- App: <http://localhost:3000>
- Emulator UI (inspect data): <http://localhost:4000>

In dev, **OTP codes are printed to the `npm run dev` terminal** (no email is sent).
Set the `SMTP_*` vars in `.env.local` to send real emails.

## 4. First run walkthrough

1. Go to `/login`, enter `admin@example.com`, grab the code from the dev terminal → you land in the **admin console**.
2. **Sites → Add site**: search an address (or enter lat/lng), choose a boundary:
   - **Radius** — must be within N metres of the point.
   - **Whole state / Whole country** — clock in anywhere in that region (for workers who move between sites).
   - Toggle **Require photo**.
3. **Workers → Add worker**: name + email, tick the sites to assign.
4. Open `/login` on a phone (or the same browser), sign in with the worker's email.
5. Worker taps **Start shift** → confirms location (+ photo if required) → live timer runs.
   Admin sees them on the **Live monitor** in real time, including if they move off-site.
6. Worker can also add a **manual timesheet** (any location, break, paid/unpaid) → **Approvals** in the admin console (approve / edit / on-hold / decline). Status + full history sync back to the worker instantly.

---

## Architecture

```
app/
  login/                 One-time-code sign-in (admin + worker)
  admin/                 Admin console (server-guarded, admin role)
    page.tsx             Live monitor (real-time)
    approvals/           Approve / edit / decline shifts & timesheets
    sites/  workers/     CRUD
  worker/                Worker app (server-guarded, worker role)
    page.tsx             Clock-in/out home (geofence + camera)
    timesheet/ history/ profile/
  api/                   Server routes — the ONLY writers to Firestore
lib/                     firebase (client/admin), auth/session, geofence,
                         time math, repos, live listeners
components/              UI kit, shells, camera, maps picker
firestore.rules          Clients read own data only; writes are server-only
storage.rules            Photos scoped per worker uid
```

### Security model
- **All writes go through server API routes** using the Admin SDK. Firestore rules give clients **read-only** access to their own data, so a worker cannot forge a shift, fake an approval, or edit hours.
- **OTP** codes are hashed, expiring, attempt-limited and rate-limited (server-side).
- **Sessions** are signed (HMAC) httpOnly cookies; route access is guarded server-side by role.
- **Geofence is validated server-side** on clock-in — client GPS is never trusted alone. Low-accuracy and mock-location readings are rejected. Live pings keep the admin's off-site view current.
- Photos upload to per-worker Storage folders (rules-enforced), image-only, size-capped.

## Going to production (Firebase cloud)
1. Create a Firebase project; enable Firestore, Auth, Storage.
2. In `.env.local` set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false`, fill the real
   `NEXT_PUBLIC_FIREBASE_*` values, and paste a service-account JSON into
   `FIREBASE_SERVICE_ACCOUNT` (single line).
3. Deploy rules: `npx firebase deploy --only firestore:rules,storage:rules`.
4. Set a strong `APP_SECRET`, real `ADMIN_EMAILS`, and `SMTP_*` for OTP email.
5. Deploy the Next.js app (Vercel/Render/your host).

## Scripts
| command | what |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run emulators` | Firebase emulators (persists data to `.emulator-data/`) |
| `npm run emulators:fresh` | Emulators with no persisted data |
| `npm run build` | Production build + full type check |
