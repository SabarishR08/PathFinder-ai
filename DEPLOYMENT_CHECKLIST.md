# PathFinder AI - Deployment Checklist

## ✅ Files Ready (Already Committed & Pushed)
- `render.yaml` - Render.com backend configuration
- `frontend/vercel.json` - Vercel SPA routing
- `backend/main.py` - Production CORS configuration
- `.github/workflows/keep-warm.yml` - Auto-ping to prevent cold starts

---

## 🚀 Step-by-Step Deployment Guide

### Step 1: Deploy Backend on Render.com

1. Go to **[render.com](https://render.com)** → Sign up/log in with GitHub
2. Click **New** → **Blueprint**
3. Connect repo: `SabarishR08/PathFinder-ai`
4. Render auto-detects `render.yaml`
5. **Set environment variables:**
   - `GROQ_API_KEY` = `[YOUR NEW ROTATED GROQ KEY]`
   - `ALLOWED_ORIGINS` = (leave blank for now)
6. Click **Deploy** (takes 3-5 minutes)
7. **Copy the live URL** (e.g., `https://pathfinder-backend-xyz.onrender.com`)
8. **Test**: Visit `https://[your-url]/health` → should return `{"status":"ok"}`

---

### Step 2: Deploy Frontend on Vercel

1. Go to **[vercel.com](https://vercel.com)** → Sign up/log in with GitHub
2. Click **New Project** → Import `SabarishR08/PathFinder-ai`
3. **IMPORTANT**: Set **Root Directory** to `frontend`
4. **Add environment variable:**
   - Key: `VITE_API_URL`
   - Value: `[YOUR RENDER URL FROM STEP 1]` (no trailing slash)
   - Example: `https://pathfinder-backend-xyz.onrender.com`
5. Click **Deploy** (takes 1-2 minutes)
6. **Copy your Vercel URL** (e.g., `https://pathfinder-ai.vercel.app`)

---

### Step 3: Update Backend CORS

1. Go to **Render dashboard** → Your service → **Environment**
2. Update `ALLOWED_ORIGINS` = `[YOUR VERCEL URL FROM STEP 2]`
   - Example: `https://pathfinder-ai.vercel.app`
3. Save → Auto-redeploys (2 minutes)

---

### Step 4: Update GitHub Action

1. Open `.github/workflows/keep-warm.yml` in your repo
2. Replace `YOUR-RENDER-URL` with your actual Render backend URL (just the hostname)
   - Example: change `https://YOUR-RENDER-URL.onrender.com/health`
   - To: `https://pathfinder-backend-xyz.onrender.com/health`
3. Commit and push
4. Go to GitHub repo → **Actions** tab
5. Find "Keep Backend Warm" workflow
6. Click **Run workflow** manually to test it works

---

### Step 5: End-to-End Test

1. Open your Vercel URL in browser
2. Complete full flow:
   - Landing → Onboarding
   - Try chat-intake: "I know Python and want to learn machine learning"
   - View dashboard
   - Mark a skill as complete
3. Open browser console (F12) → check for errors

---

## 📋 Final Checklist

- [ ] Backend deployed on Render
- [ ] Frontend deployed on Vercel
- [ ] CORS updated with Vercel URL
- [ ] GitHub Action updated with Render URL
- [ ] GitHub Action manually tested via Actions tab
- [ ] Full end-to-end flow tested on live URLs
- [ ] No CORS errors in browser console

---

## 🔗 Live URLs (Fill in after deployment)

- **Backend (Render):** `https://______________________.onrender.com`
- **Frontend (Vercel):** `https://______________________.vercel.app`

---

## ⚠️ Known Issues

### Render Free Tier Cold Starts
- Sleeps after 15 min of inactivity
- First request takes 30-50 seconds to wake
- **Solution**: GitHub Action pings every 10 minutes (already set up)

### Demo Day Tip
If judges are evaluating at a specific time, manually hit `/health` 1-2 minutes before to ensure it's warm.

---

## 📊 Resource Limits (Free Tier)

**Render:**
- 512MB RAM
- Sleeps after 15min idle
- 750 hours/month (more than enough)

**Vercel:**
- 100GB bandwidth/month
- Unlimited builds
- No cold starts (always instant)

**GitHub Actions:**
- Public repos: unlimited minutes
- Private repos: 2000 min/month (you'll use ~15-20/month)

---

## 🛠️ Troubleshooting

**"CORS error" in browser console:**
- Check `ALLOWED_ORIGINS` in Render matches your Vercel URL exactly
- No trailing slash in Vercel URL

**Backend returns 500 error:**
- Check Render logs for errors
- Verify `GROQ_API_KEY` is set correctly in Render dashboard

**Frontend shows "Network Error":**
- Check `VITE_API_URL` in Vercel matches your Render URL
- No trailing slash

**GitHub Action failing:**
- Check `.github/workflows/keep-warm.yml` has correct Render URL
- Check Actions tab for error logs

---

## 🎯 Next Steps After Deployment

1. Update README.md with live URLs
2. Test full flow with a fresh browser (incognito mode)
3. Prepare demo script
4. Take screenshots/screen recording for submission
5. Update submission form with live URLs
