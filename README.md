# ClaudeBudget 💰

A fast, private, offline-first budget tracker you add to your iPhone home
screen — no App Store, no monthly fees. Tap in what you spend in ~3 seconds,
see exactly where your money goes each month, and (optionally) have every
entry sync straight into your own Google Sheet.

Built for irregular income: it tracks **income and expenses** so your real
monthly **net** is always front and centre.

![icon](icons/icon-192.png)

---

## What it does

- **3-second entry** — type the amount, tap a category, save. The app
  auto-suggests a category from your note (e.g. "Carrefour" → Groceries,
  "padel" → Padel/Sport, "ADNOC" → Fuel).
- **Monthly dashboard** — income vs spent vs net, a category breakdown with
  bars, and your full transaction history (tap ✕ to delete).
- **Works offline** — everything is stored on your phone; it opens instantly
  even with no signal.
- **Google Sheets sync (optional)** — each entry writes into a Sheet in your
  own Google account. Nothing is sent to any third party.
- **CSV export** — one tap, for any spreadsheet.
- Currency defaults to **AED** and categories are tuned for daily UAE life.
  Both are editable in Settings.

---

## Get it onto your iPhone

The app is just static files, so you host it once (free) and then "Add to
Home Screen". Pick whichever is easiest:

### Option A — GitHub Pages (recommended, free, permanent)

1. Push this repo to GitHub (already done if you're reading this there).
2. On GitHub: **Settings → Pages → Build and deployment**.
   - Source: **Deploy from a branch**
   - Branch: `claude/budget-tracking-app-wdhpwh` (or `main`), folder `/ (root)`.
3. Wait ~1 minute. GitHub gives you a URL like
   `https://<you>.github.io/ClaudeBudget/`.
4. Open that URL in **Safari** on your iPhone.
5. Tap the **Share** button → **Add to Home Screen** → **Add**.
6. Launch it from the home screen — it now runs full-screen like a real app.

> ⚠️ Use Safari for the "Add to Home Screen" step — Chrome on iOS can't install PWAs.

### Option B — Quick local test (on your computer)

```bash
cd ClaudeBudget
python3 -m http.server 8000
# then open http://localhost:8000 in a browser
```

---

## Turn on Google Sheets sync (≈2 minutes, optional)

This gives you the live spreadsheet you wanted. Your data stays entirely in
your Google account — the app talks directly to *your* Sheet.

1. Create a new **Google Sheet**.
2. **Extensions → Apps Script**.
3. Delete the sample code, then paste **all** of [`google-apps-script.gs`](google-apps-script.gs). Save.
4. **Deploy → New deployment → type: Web app**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
5. Authorize when prompted, then copy the **Web app URL** (it ends in `/exec`).
6. In the app: **Settings → Google Sheets sync URL** → paste it.
7. Tap **Test sync** — a `TEST` row should appear in your Sheet. Done. ✅

From now on every entry appears in the Sheet automatically. Offline entries
queue up and push the next time you're online (or tap **Push all to Sheet**).
The little dot top-right shows sync status: green = synced, amber = pending,
grey = sync off.

---

## How to use it day to day

1. You pay with your card (double-tap, Face ID, tap).
2. Open ClaudeBudget from your home screen.
3. Punch in the amount, type a quick note ("petrol", "lunch", "padel"), check
   the suggested category, hit **Save**.
4. At month-end, open the **Month** tab to see exactly where it all went — or
   review/edit the Google Sheet.

---

## A note on full automation

iPhone deliberately blocks any app from reading your Apple Pay / card
transactions, so *nothing* can log payments 100% silently — not even the big
budgeting apps. The realistic next step toward "automatic" is an **Apple
Shortcut** that reads your bank's payment SMS/notification and pre-fills an
entry for you to confirm. That's a good v2 once you're using this daily — say
the word and we'll build it.

---

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | App markup (Add / Month / Settings views) |
| `styles.css` | Styling (dark, mobile-first) |
| `app.js` | All app logic + Google Sheets sync |
| `sw.js` | Service worker (offline support) |
| `manifest.webmanifest` | PWA / home-screen metadata |
| `google-apps-script.gs` | The Sheets sync endpoint (paste into Apps Script) |
| `icons/` | App icons |
| `tools/make_icons.py` | Regenerates the icons |

All data lives in your browser's `localStorage` under `claudebudget.v1`,
plus your Google Sheet if sync is on.
