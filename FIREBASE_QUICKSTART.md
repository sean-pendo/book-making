# Firebase Hosting - 5 Minute Quickstart

Deploy your Book Builder frontend to Firebase in 5 minutes.

## Prerequisites

- Google account
- Book Builder project (already have it ✅)
- Node.js installed

## Step-by-Step Deployment

### 1. Install Firebase CLI (1 minute)

```bash
npm install -g firebase-tools
```

### 2. Login to Firebase (30 seconds)

```bash
firebase login
```

This will open your browser to authenticate with Google.

### 3. Initialize Firebase Project (2 minutes)

```bash
cd book-ops-workbench
firebase init hosting
```

**Answer the prompts:**
- **Use existing project or create new?** → Create new project
- **Project name:** `book-builder-prod` (or your choice)
- **What do you want to use as your public directory?** → `dist`
- **Configure as a single-page app?** → **Yes**
- **Set up automatic builds with GitHub?** → No (optional)
- **Overwrite index.html?** → **No**

### 4. Build Your App (30 seconds)

```bash
npm run build
```

This creates the `dist/` folder with your optimized production build.

### 5. Deploy! (1 minute)

```bash
firebase deploy --only hosting
```

**Done!** 🎉

You'll see output like:
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/book-builder-prod
Hosting URL: https://book-builder-prod.web.app
```

## Your App is Now Live!

Visit your hosting URL (shown in deploy output) to see your live app.

## Configure Supabase Connection

Your app needs to connect to Supabase. The `.env` file contains the right values, and they're baked into the build at build-time.

**Already configured! ✅** Your `dist/` build includes the Supabase URL and anon key from your `.env` file.

## Add Custom Domain (Optional)

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. Navigate to **Hosting** → **Add custom domain**
4. Follow the DNS configuration steps

## Update Supabase Auth URLs

After deployment, update your Supabase auth settings:

1. Go to https://app.supabase.com/project/lolnbotrdamhukdrrsmh/auth/url-configuration
2. Update **Site URL** to your Firebase hosting URL: `https://book-builder-prod.web.app`
3. Add to **Redirect URLs**: `https://book-builder-prod.web.app/**`

## Subsequent Deployments

After making changes:

```bash
npm run build
firebase deploy --only hosting
```

That's it! 30 seconds to redeploy.

## Useful Commands

```bash
# View hosting URL and project info
firebase hosting:channel:list

# Create preview deployment (test before going live)
firebase hosting:channel:deploy preview

# View logs
firebase hosting:channel:list

# Rollback to previous version
firebase hosting:clone SOURCE_SITE_ID:SOURCE_CHANNEL_ID TARGET_SITE_ID:live
```

## Cost

**Free tier includes:**
- 10 GB storage
- 360 MB/day bandwidth
- Custom domain
- SSL certificate

**Estimated cost for your app:** $0/month (well within free tier)

## Troubleshooting

### Issue: "Not authorized to access project"
**Fix:** Run `firebase login --reauth`

### Issue: "Build folder not found"
**Fix:** Make sure you ran `npm run build` first

### Issue: App shows but can't connect to Supabase
**Fix:**
1. Check your `.env` file has correct credentials
2. Rebuild: `npm run build`
3. Redeploy: `firebase deploy --only hosting`

### Issue: Blank page after deployment
**Fix:** Check browser console (F12). Likely a build issue.
- Verify build worked: `npm run preview` (should work locally)
- Check firebase.json has correct SPA rewrite rules ✅ (already configured)

## Next Steps

1. ✅ App is live on Firebase
2. Update Supabase auth URLs (see above)
3. Test the deployed app
4. Deploy Supabase migrations (see [DEPLOYMENT.md](DEPLOYMENT.md))
5. Deploy Edge Functions (see [DEPLOYMENT.md](DEPLOYMENT.md))

## Support

- Firebase Docs: https://firebase.google.com/docs/hosting
- Firebase Console: https://console.firebase.google.com
- Book Builder Deployment Guide: [DEPLOYMENT.md](DEPLOYMENT.md)
