// Extraction layer.
// For known ATS platforms we hit their public JSON API directly — no HTML
// parsing, no fragility. For everything else we fall back to the discovery
// result itself (title/link/snippet), since Google has already indexed the
// specific page.

function matchesTitle(candidateTitle, jobTitle) {
  return candidateTitle.toLowerCase().includes(jobTitle.toLowerCase());
}

function prettifyName(raw) {
  if (!raw) return "Unknown";
  const words = raw.replace(/[-_]+/g, " ").trim().split(/\s+/);
  return words
    .map((w) => {
      if (w.length <= 4 && /[0-9]/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

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

const PUBLISHED_WITHIN_DAYS = 10;

function isRecentEnough(dateInput, days = PUBLISHED_WITHIN_DAYS) {
  if (!dateInput) return true;
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return true;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}

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
      .filter((j) => isRecentEnough(j.updated_at))
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
      .filter((j) => isRecentEnough(j.createdAt))
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

function looksLikeLocation(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  if (t.split(/\s+/).length > 14) return false;
  return /\b(dubai|abu dhabi|sharjah|ajman|doha|riyadh|jeddah|manama|kuwait city|muscat|remote|hybrid|onsite|uae|saudi|qatar|bahrain|oman)\b/.test(t);
}

function extractFromSearchResult(result, platformLabel, jobTitle) {
  if (!matchesTitle(result.title, jobTitle)) return [];
  const snippet = result.snippet || "";
  return [
    {
      title: result.title,
      company: guessCompanyFromUrl(result.link, platformLabel),
      location: looksLikeLocation(snippet) ? snippet : "See listing",
      link: result.link,
      platform: platformLabel
    }
  ];
}

const GENERIC_SUBDOMAINS = ["jobs", "job", "career", "careers", "boards", "apply", "recruiting", "hiring", "www"];

function guessCompanyFromUrl(url, platformLabel) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const pathParts = u.pathname.split("/").filter(Boolean);

    if ((platformLabel === "SmartRecruiters" || platformLabel === "Ashby") && pathParts.length > 0) {
      return prettifyName(pathParts[0]);
    }

    if (platformLabel === "Workday") {
      const sub = host.split(".")[0];
      if (sub && sub !== "www") return prettifyName(sub);
    }

    const segments = host.split(".");
    let nameSegment = segments[0];
    if (GENERIC_SUBDOMAINS.includes(nameSegment.toLowerCase()) && segments.length > 1) {
      nameSegment = segments[1];
    }
    return prettifyName(nameSegment);
  } catch {
    return "Unknown";
  }
}

function normalizeLink(link) {
  try {
    const u = new URL(link);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return link;
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
      allJobs.push(...extractFromSearchResult(candidate, "Ashby", jobTitle));
    } else if (source === "workday") {
      allJobs.push(...extractFromSearchResult(candidate, "Workday", jobTitle));
    } else if (source === "smartrecruiters") {
      allJobs.push(...extractFromSearchResult(candidate, "SmartRecruiters", jobTitle));
    } else {
      allJobs.push(...extractFromSearchResult(candidate, "Company site", jobTitle));
    }
  }

  const seenLinks = new Set();
  const linkDeduped = allJobs.filter((j) => {
    const key = normalizeLink(j.link);
    if (seenLinks.has(key)) return false;
    seenLinks.add(key);
    return true;
  });

  const seenCombo = new Set();
  const deduped = linkDeduped.filter((j) => {
    const key = `${j.company.toLowerCase()}|${j.title.toLowerCase()}`;
    if (seenCombo.has(key)) return false;
    seenCombo.add(key);
    return true;
  });

  const countryFiltered = deduped.filter((j) => matchesCountry(j.location, country));

  return countryFiltered.slice(0, maxResults);
}

module.exports = { extractJobs };
