// Extraction layer.
// For known ATS platforms we hit their public JSON API directly — no HTML
// parsing, no fragility. For everything else we fall back to the discovery
// result itself (title/link/snippet), since Google has already indexed the
// specific page.

function matchesTitle(candidateTitle, jobTitle) {
  return candidateTitle.toLowerCase().includes(jobTitle.toLowerCase());
}

// Turns a raw slug like "trans-guard_group" or "g4s" into a readable
// display name like "Trans Guard Group" or "G4S".
function prettifyName(raw) {
  if (!raw) return "Unknown";
  const words = raw.replace(/[-_]+/g, " ").trim().split(/\s+/);
  return words
    .map((w) => {
      // Short alphanumeric tokens like "g4s" read better fully uppercased.
      if (w.length <= 4 && /[0-9]/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// Keeps a job only if its location text plausibly matches the requested
// country, or is remote/unspecified (since remote listings aren't tied to
// one country and shouldn't be dropped just because we can't confirm it).
function matchesCountry(locationText, country) {
  if (!country) return true;
  const text = (locationText || "").toLowerCase();
  const target = country.toLowerCase();
  if (!text || text === "not specified" || text === "see listing") return true;
  if (text.includes("remote") || text.includes("global") || text.includes("anywhere")) {
    return true;
  }
  return text.includes(target);
}

// --- Greenhouse -------------------------------------------------------
// URL shape: boards.greenhouse.io/{company}/jobs/{id}  or  boards.greenhouse.io/{company}
async function extractGreenhouse(url, jobTitle) {
  const match = url.match(/boards\.greenhouse\.io\/([^/]+)/);
  if (!match) return [];
  const company = match[1];

  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${company}/jobs`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || [])
      .filter((j) => matchesTitle(j.title, jobTitle))
      .map((j) => ({
        title: j.title,
        company: prettifyName(company),
        location: j.location?.name || "Not specified",
        link: j.absolute_url,
        platform: "Greenhouse"
      }));
  } catch (err) {
    console.error(`Greenhouse extraction failed for ${company}:`, err.message);
    return [];
  }
}

// --- Lever --------------------------------------------------------------
// URL shape: jobs.lever.co/{company}/{postingId}
async function extractLever(url, jobTitle) {
  const match = url.match(/jobs\.lever\.co\/([^/]+)/);
  if (!match) return [];
  const company = match[1];

  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data || [])
      .filter((j) => matchesTitle(j.text, jobTitle))
      .map((j) => ({
        title: j.text,
        company: prettifyName(company),
        location: j.categories?.location || "Not specified",
        link: j.hostedUrl,
        platform: "Lever"
      }));
  } catch (err) {
    console.error(`Lever extraction failed for ${company}:`, err.message);
    return [];
  }
}

// --- Fallback: use the discovery result itself --------------------------
// Covers Ashby, Workday, SmartRecruiters, and custom company career pages.
// Google has already indexed the specific job page, so the link is direct.
// The snippet is checked for a country mention since we don't have a real
// structured location field from these sources.
function extractFromSearchResult(result, platformLabel) {
  const snippet = result.snippet || "";
  return [
    {
      title: result.title,
      company: guessCompanyFromUrl(result.link),
      location: snippet.length < 80 ? snippet : "See listing",
      link: result.link,
      platform: platformLabel
    }
  ];
}

function guessCompanyFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return prettifyName(host.split(".")[0]);
  } catch {
    return "Unknown";
  }
}

async function extractJobs(candidates, jobTitle, country = "", maxResults = 20) {
  const allJobs = [];

  for (const candidate of candidates) {
    const { link, source } = candidate;

    if (source === "greenhouse") {
      allJobs.push(...(await extractGreenhouse(link, jobTitle)));
    } else if (source === "lever") {
      allJobs.push(...(await extractLever(link, jobTitle)));
    } else if (source === "ashby") {
      allJobs.push(...extractFromSearchResult(candidate, "Ashby"));
    } else if (source === "workday") {
      allJobs.push(...extractFromSearchResult(candidate, "Workday"));
    } else if (source === "smartrecruiters") {
      allJobs.push(...extractFromSearchResult(candidate, "SmartRecruiters"));
    } else {
      allJobs.push(...extractFromSearchResult(candidate, "Company site"));
    }
  }

  // Dedupe by link.
  const seen = new Set();
  const deduped = allJobs.filter((j) => {
    if (seen.has(j.link)) return false;
    seen.add(j.link);
    return true;
  });

  // Drop jobs whose location clearly doesn't match the requested country.
  const countryFiltered = deduped.filter((j) => matchesCountry(j.location, country));

  return countryFiltered.slice(0, maxResults);
}

module.exports = { extractJobs };
