# Yubi Demolition — Production Deployment Guide

This takes the app from local emulators to a live, production Firebase project.
Estimated time: ~45 minutes. You'll need a Google account and a credit card on
file for Firebase (the Blaze plan — usage is tiny/free for this app, but Cloud
Storage requires it).

---

## 0. Add the logo (one step, do this first)

Save the Yubi Demolition logo image into the project as:

```
public/logo.png
```

That's it — the login screen, admin sidebar, and worker app pick it up
automatically. (A transparent-background PNG looks best; ~600px wide is plenty.)

---

## 1. (Option B) Reuse your EXISTING Firebase project

If you already have a Firebase project (e.g. your old clock-in app) and want to
reuse it, do this **instead of** creating a new project in Section 1. You keep the
same project, billing, and Storage bucket — you just wipe the old app's data and
replace its rules.

> ⚠️ **This is irreversible. Back up first if unsure** (Section 1B-0).

**1B-0. Back up the old data (optional but recommended)**
```bash
# Needs the gcloud CLI + a Cloud Storage bucket you own.
gcloud config set project YOUR_EXISTING_PROJECT_ID
gcloud firestore export gs://YOUR_BACKUP_BUCKET/backup-$(date +%F)
```

**1B-1. Delete old Firestore data**
- Console way: Firestore Database → open each old collection → ⋮ → **Delete collection**.
- CLI way (deletes ALL documents/collections):
  ```bash
  npx firebase firestore:delete --all-collections --force --project YOUR_EXISTING_PROJECT_ID
  ```

**1B-2. Delete old Storage files**
- Console: Storage → select the old folders/files → **Delete**.
- CLI (needs gsutil): `gsutil -m rm -r gs://YOUR_BUCKET/**`

**1B-3. Clear old Auth users** (important)
- Authentication → Users → delete the old accounts.
- Why: our login is Google-only. If an old account exists for the same email
  under a different sign-in method, Google sign-in can conflict. A clean user
  list avoids that. (New users are created automatically on first Google login.)

**1B-4. Remove old Hosting / Functions (only if the old app used them)**
- Hosting: `npx firebase hosting:disable --project YOUR_EXISTING_PROJECT_ID`
  (or just deploy this app over it later).
- Functions: delete unused ones in Console → Functions.

**1B-5. Reuse the config**
- Get the web config from ⚙ → Project settings → your existing Web app
  (or **Add app → Web** to register a fresh one). Copy those values into the
  `NEXT_PUBLIC_FIREBASE_*` env vars.
- The Firestore **region** is fixed for existing projects — that's fine, leave it.

**Then continue from Section 3** (enable Google sign-in), **skip Section 4 & 5**
if Firestore/Storage already exist, and do Sections 6–11 as normal. Deploying our
rules in Section 7 **overwrites** the old app's rules — which is what you want.

---

## 1. Create the Firebase project  *(Option A — skip if you did Option B)*

1. Go to <https://console.firebase.google.com> → **Add project**.
2. Name it (e.g. `yubi-demolition`), accept defaults, create.
3. Upgrade to the **Blaze** plan: ⚙ → Usage and billing → Modify plan → Blaze.
   (Storage and outbound requests need it; costs are effectively $0 at this scale.)

## 2. Register a Web App (client config)

1. Project Overview → **Add app** → Web (`</>`).
2. Nickname it, **don't** enable Hosting yet, Register app.
3. Copy the `firebaseConfig` values into your env vars (Section 8):
   - `apiKey` → `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `authDomain` → `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `projectId` → `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `storageBucket` → `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `messagingSenderId` → `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `appId` → `NEXT_PUBLIC_FIREBASE_APP_ID`

## 3. Enable Authentication (Google Sign-In)

1. Build → **Authentication** → Get started.
2. **Sign-in method** tab → **Google** → Enable → pick a support email → Save.
3. **Settings** tab → **Authorized domains** → add your production domain
   (e.g. `yubidemolition.vercel.app` and/or your custom domain). `localhost` is
   already authorized for local testing against the real project.

> Login is Google-only. A person can only sign in if their Google email is
> either in `ADMIN_EMAILS` **or** registered as a Worker (Section 9).

## 4. Create the Firestore database

1. Build → **Firestore Database** → Create database.
2. Start in **production mode** (we deploy real rules next), pick a region close
   to your users (e.g. `australia-southeast1`), Enable.

## 5. Create Cloud Storage

1. Build → **Storage** → Get started → production mode → same region → Done.
2. Note the bucket name shown at the top (e.g. `yubi-demolition.firebasestorage.app`)
   — put the exact value in `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.

## 6. Service account (server credentials)

1. ⚙ → Project settings → **Service accounts** → **Generate new private key** →
   downloads a JSON file.
2. Convert it to a single line and set it as `FIREBASE_SERVICE_ACCOUNT`:
   ```bash
   node -e "console.log(JSON.stringify(require('./path-to-key.json')))"
   ```
   Paste the output (the whole `{...}`) as the value. **Never commit this.**

## 7. Deploy security rules & indexes

From the project folder, using the Firebase CLI (already a dev dependency):

```bash
npx firebase login
npx firebase use your-project-id
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```

This publishes `firestore.rules`, `firestore.indexes.json`, and `storage.rules`.
(Reminder of the model: **all writes go through the app's server**; clients get
read-only, own-data-only access. Workers cannot forge shifts or approvals.)

## 8. Google Maps Platform keys

In <https://console.cloud.google.com> (same Google project as Firebase):

1. **APIs & Services → Library** → enable **Maps JavaScript API**, **Places API**,
   **Geocoding API**.
2. **Credentials → Create credentials → API key** — make **two** keys:
   - **Browser key** → Application restriction: **HTTP referrers** = your domain
     (`https://yourdomain/*`). API restriction: Maps JavaScript + Places.
     → `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - **Server key** → Application restriction: **None** (or your server IPs).
     API restriction: Geocoding (+ Places). → `GOOGLE_MAPS_SERVER_KEY`

> The Geocoding API **rejects referrer-restricted keys** — that's why the server
> key must be None/IP-restricted. This powers geofence region checks and the
> "Started at: address" label.

## 9. Set environment variables & generate the app secret

Copy `.env.production.example` values into your host's environment (see Section 10),
filling every field. Generate a strong session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
→ `APP_SECRET`. Set `ADMIN_EMAILS` to your admin Google email(s), comma-separated.

## 10. Deploy the app

The app is a standard Next.js 16 app. Easiest is **Vercel**:

1. Push the repo to GitHub.
2. vercel.com → New Project → import the repo.
3. Add all env vars from `.env.production.example` (Settings → Environment
   Variables). Make sure `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false`.
4. Deploy. Vercel runs `next build` automatically.
5. Add your production domain to Firebase **Authorized domains** (Section 3) and
   to the browser Maps key referrers (Section 8) if you use a custom domain.

Other hosts (Render, Fly, a VPS) work too — anything that runs `npm run build`
then `npm start` with the env vars set.

## 11. First run in production

1. Visit your domain → **Continue with Google** with an email in `ADMIN_EMAILS`
   → you land in the Admin console.
2. **Sites** → add your work sites (address autocomplete + radius / whole-state /
   whole-country boundary, photo requirement).
3. **Workers** → add each worker with the **exact Google email** they'll use.
4. Workers sign in with Google, clock in/out, and submit timesheets; you approve
   in **Approvals** and monitor live in the **Dashboard**.

---

## Operational notes
- **Timezone**: worker-facing times display in Australian time (`Australia/Sydney`).
  Change `AU_TZ` in `lib/time.ts` if needed.
- **Backups**: enable scheduled Firestore backups (console → Firestore → Backups).
- **Costs**: Firestore/Storage/Maps usage for a small crew is within free tiers;
  set a billing budget alert in Google Cloud to be safe.
- **Data**: photos live in Storage under `shift-photos/{uid}/…`; shift trails and
  timesheets live in Firestore. Nothing sensitive is stored in URLs.
