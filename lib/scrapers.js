// Extraction layer.
// For known ATS platforms we hit their public JSON API directly — no HTML
// parsing, no fragility. For everything else we fall back to the discovery
// result itself (title/link/snippet), since Google has already indexed the
// specific page.

function matchesTitle(candidateTitle, jobTitle) {
  return candidateTitle.toLowerCase().includes(jobTitle.toLowerCase());
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
        company,
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
        company,
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
function extractFromSearchResult(result, platformLabel) {
  return [
    {
      title: result.title,
      company: guessCompanyFromUrl(result.link),
      location: "See listing",
      link: result.link,
      platform: platformLabel
    }
  ];
}

function guessCompanyFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.split(".")[0];
  } catch {
    return "Unknown";
  }
}

async function extractJobs(candidates, jobTitle) {
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
  return allJobs.filter((j) => {
    if (seen.has(j.link)) return false;
    seen.add(j.link);
    return true;
  });
}

module.exports = { extractJobs };
