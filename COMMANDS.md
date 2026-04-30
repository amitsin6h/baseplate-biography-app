# Development & Deployment Commands

---

## Prerequisites

```bash
# Install Supabase CLI (Mac)
brew install supabase/tap/supabase

# Install Vercel CLI
npm install -g vercel
```

---

## Initial Setup

### 1. Log in and link your Supabase project

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

> **Where to find YOUR_PROJECT_REF:**
> Supabase Dashboard → Your Project → Project Settings → General → Reference ID

### 2. Set production secrets (run once per key)

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set DIFFBOT_API_KEY=your_diffbot_token
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## Local Development

### Start local Supabase stack (Postgres + Auth + Storage + Edge Runtime)

```bash
supabase start
```

> Copy the printed `anon key` and `API URL` into `.env.local` when working locally.

### Stop local Supabase stack

```bash
supabase stop
```

### Serve edge functions locally

```bash
supabase functions serve --env-file supabase/.env
```

> Functions are available at `http://localhost:54321/functions/v1/<function-name>`

---

## Database Migrations

### Apply migration to local Supabase

```bash
supabase db push
```

### Apply migration to production (linked project)

```bash
supabase db push --linked
```

### Generate a new migration from schema diff

```bash
supabase db diff --schema public -f your_migration_name
```

---

## Test Edge Functions Locally

Replace `YOUR_ANON_KEY` with the key printed by `supabase start`.

### biography-generate-profile-from-text

```bash
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/biography-generate-profile-from-text' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"biography_profile_id":"your-profile-uuid-here"}'
```

### biography-fetch-profile-from-url

```bash
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/biography-fetch-profile-from-url' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"profile_url":"https://linkedin.com/in/example"}'
```

### biography-rewrite-section

```bash
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/biography-rewrite-section' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "biography_profile_id": "your-profile-uuid-here",
    "section_key": "personal_overview",
    "instruction": "Make it more concise and focus on the last 5 years"
  }'
```

---

## Deploy to Production

### Deploy migration

```bash
supabase db push --linked
```

### Deploy all edge functions

```bash
supabase functions deploy biography-generate-profile-from-text
supabase functions deploy biography-fetch-profile-from-url
supabase functions deploy biography-rewrite-section
```

### Deploy frontend to Vercel

```bash
vercel deploy --prod
```

> Or push to your `main` branch if Vercel is connected to GitHub.

---

## Vercel Environment Variables

Set these in **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → anon / public key |
