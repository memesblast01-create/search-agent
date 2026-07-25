# Direct Source — Job Scanner

Finds job postings **directly on company career pages** (Greenhouse, Lever,
Ashby, Workday, SmartRecruiters, custom sites) instead of aggregators like
LinkedIn, Indeed, or Naukrigulf.

## How it works

1. **Discovery** — you give a job title + country. The backend runs a handful
   of targeted Google searches (via SerpApi) scoped to each major ATS
   platform, plus a general query excluding LinkedIn/Indeed/Naukrigulf/etc.
2. **Extraction** — for Greenhouse and Lever, it hits their public JSON APIs
   directly for clean structured data. For everything else, it uses the
   direct link Google already indexed.
3. **Storage** — results are saved to Firestore, keyed by URL, so re-running
   the same search flags what's genuinely *new* since last time.
4. **Dashboard** — a single page with a search box and a results feed.

## Setup

### 1. SerpApi (required)
- Sign up at https://serpapi.com — free tier gives 100–250 searches/month, no card needed.
- Copy your API key from the dashboard.

### 2. Firebase (optional, but recommended for dedupe)
- Create a project at https://console.firebase.google.com
- Enable Firestore (Native mode).
- Project Settings → Service Accounts → Generate new private key → downloads a JSON file.
- Copy that file's entire contents as a single line into `FIREBASE_SERVICE_ACCOUNT_KEY`.

### 3. Deploy on Vercel (matches your usual workflow)
- Push this folder to a new GitHub repo.
- Import it in Vercel.
- In Vercel → Settings → Environment Variables, add:
  - `SERPAPI_KEY`
  - `FIREBASE_SERVICE_ACCOUNT_KEY` (optional)
- Deploy. The dashboard is served at your root URL; the API lives at `/api/search`.

## Local testing (optional)
If you ever want to test outside the browser workflow:
```
npm install
vercel dev
```

## Extending this

- **More ATS platforms**: Ashby and Workday currently fall back to the
  search-result link directly rather than hitting a structured API. If you
  want cleaner data from them, `lib/scrapers.js` is where to add a proper
  extractor — Ashby has an unofficial JSON endpoint per org, Workday's is
  messier and usually needs the specific tenant URL pattern.
- **Scheduled runs**: right now this is on-demand (you click Scan). If you
  want it to run automatically, add a Vercel Cron Job that calls `/api/search`
  with your saved keyword/country combos on a schedule, and only surface
  `isNew` results in a notification.
- **Notifications**: swap/add a Telegram bot or email step in `api/search.js`
  after `saveJobsAndFlagNew` — send only the jobs where `isNew` is true.
- **Excluded aggregator list**: edit `AGGREGATORS_TO_EXCLUDE` in
  `lib/serpapi.js` to add more sites you want to filter out.
