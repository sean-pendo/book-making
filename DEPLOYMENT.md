# Deployment Guide

This guide covers deploying Book Builder to production.

## Prerequisites

1. **Supabase CLI** - Install first:
   ```bash
   brew install supabase/tap/supabase
   # OR
   npm install -g supabase
   ```

2. **Supabase Account** - Create at [supabase.com](https://supabase.com)

3. **Hosting Platform** - Choose one:
   - Vercel (recommended)
   - Netlify
   - Lovable.dev (current)

## 1. Database Setup (Supabase)

### A. Link to Remote Project

```bash
cd book-ops-workbench
supabase link --project-ref lolnbotrdamhukdrrsmh
```

You'll be prompted for your Supabase access token. Get it from:
https://app.supabase.com/account/tokens

### B. Push Migrations

```bash
# Push all migrations to remote database
supabase db push

# Verify migrations
supabase db diff
```

### C. Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy process-large-import
supabase functions deploy recalculate-accounts
supabase functions deploy generate-assignment-rule
supabase functions deploy ai-balance-optimizer
supabase functions deploy parse-ai-balancer-config
supabase functions deploy manager-ai-assistant

# Or deploy all at once
for func in supabase/functions/*; do
  supabase functions deploy $(basename $func)
done
```

## 2. Auth Configuration

### A. Configure Auth Providers (via Supabase Dashboard)

1. Go to: https://app.supabase.com/project/lolnbotrdamhukdrrsmh/auth/providers
2. Enable desired providers:
   - **Email** (already enabled)
   - **Google OAuth** (optional)
   - **GitHub OAuth** (optional)

### B. Set Site URL and Redirect URLs

1. Go to: https://app.supabase.com/project/lolnbotrdamhukdrrsmh/auth/url-configuration
2. Set **Site URL**: `https://your-domain.com`
3. Add **Redirect URLs**:
   - `https://your-domain.com/**`
   - `http://localhost:8080/**` (for local dev)

### C. Email Templates (optional)

Customize email templates at:
https://app.supabase.com/project/lolnbotrdamhukdrrsmh/auth/templates

## 3. Frontend Hosting

### Option A: Vercel (Recommended)

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   cd book-ops-workbench
   vercel
   ```

3. **Set Environment Variables** (in Vercel dashboard):
   - `VITE_SUPABASE_URL`: `https://lolnbotrdamhukdrrsmh.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: Get from Supabase dashboard → Settings → API

4. **Configure Domain** (optional):
   - Add custom domain in Vercel dashboard
   - Update Site URL in Supabase auth settings

### Option B: Netlify

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy**:
   ```bash
   cd book-ops-workbench
   netlify deploy --prod
   ```

3. **Set Environment Variables** (in Netlify dashboard):
   - `VITE_SUPABASE_URL`: `https://lolnbotrdamhukdrrsmh.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: Get from Supabase dashboard

### Option C: Firebase Hosting

1. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize (first time only)**:
   ```bash
   cd book-ops-workbench
   firebase init hosting
   # Select: Use existing project or create new
   # Public directory: dist
   # Single-page app: Yes
   # GitHub deploys: No (optional)
   ```

4. **Build and Deploy**:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

5. **Set Environment Variables**:
   Firebase hosting doesn't support server-side env vars, but you can:
   - Use build-time variables (already in .env)
   - Or use Firebase Remote Config for runtime config

### Option D: Lovable.dev (Previous Setup)

No longer recommended. Project has been migrated to independent hosting.

## 4. Row Level Security (RLS)

Your RLS policies are defined in migrations. Verify they're active:

```bash
# Check RLS status
supabase db diff
```

Key policies to verify:
- `assignment_rules` - RevOps and Leadership can manage
- `accounts` - Users can view based on role
- `sales_reps` - Users can view based on role

## 5. Post-Deployment Checklist

- [ ] Migrations applied successfully
- [ ] Edge Functions deployed
- [ ] Auth providers configured
- [ ] Site URL and redirect URLs set
- [ ] Environment variables set in hosting platform
- [ ] RLS policies active
- [ ] Test auth flow (signup, login, logout)
- [ ] Test core features (import, assignment generation)
- [ ] Check Edge Function logs for errors

## 6. Monitoring & Logs

### Supabase Logs
```bash
# View Edge Function logs
supabase functions logs process-large-import

# View database logs
supabase db logs
```

### Via Dashboard
- Edge Functions: https://app.supabase.com/project/lolnbotrdamhukdrrsmh/functions
- Database: https://app.supabase.com/project/lolnbotrdamhukdrrsmh/logs/postgres-logs
- Auth: https://app.supabase.com/project/lolnbotrdamhukdrrsmh/logs/auth-logs

## 7. Rollback Plan

If deployment fails:

```bash
# Rollback to previous migration
supabase db reset --version <previous-version>

# Or full reset (DANGER: data loss)
supabase db reset
```

## Troubleshooting

### Migration Errors
- Check `supabase/migrations/` for syntax errors
- Verify ghost build IDs are wrapped in DO blocks
- Run migrations locally first: `supabase db reset`

### Auth Issues
- Verify Site URL matches your domain
- Check redirect URLs include wildcards
- Ensure `.env` has correct Supabase URL and keys

### Edge Function Errors
- Check function logs: `supabase functions logs <function-name>`
- Verify JWT settings in `config.toml`
- Test locally: `supabase functions serve`

## Environment Variables Reference

### Production (.env)
```bash
VITE_SUPABASE_URL=https://lolnbotrdamhukdrrsmh.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### Local Development (.env.local)
```bash
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key>
```

Get keys from:
https://app.supabase.com/project/lolnbotrdamhukdrrsmh/settings/api
