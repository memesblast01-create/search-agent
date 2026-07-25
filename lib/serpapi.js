// Discovery layer.
// Instead of one broad web search, we run several *targeted* queries:
//   - one per major ATS platform (Greenhouse, Lever, Ashby, Workday, SmartRecruiters)
//   - one general query aimed at company domains, explicitly excluding aggregators
//     and social media
// This surfaces links that live on the company's own hiring page/ATS instance —
// never job boards, never social media, never news/blog posts.

const AGGREGATORS_TO_EXCLUDE = [
  "linkedin.com",
  "indeed.com",
  "naukrigulf.com",
  "bayt.com",
  "glassdoor.com",
  "monsterindia.com",
  "gulftalent.com",
  "simplyhired.com",
  "ziprecruiter.com",
  // Social media — never a career site, but Google sometimes surfaces
  // posts that merely mention a job title.
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "pinterest.com",
  "reddit.com",
  "youtube.com",
  "quora.com",
  // Generic blog/forum/news platforms — never company-owned career pages.
  "medium.com",
  "blogspot.com",
  "wordpress.com",
  "tumblr.com"
];

// Domains that are never acceptable results, checked again after search —
// a safety net in case Google ignores the -site: exclusions in the query.
const BLOCKED_HOSTS = AGGREGATORS_TO_EXCLUDE;

// Signals that a URL is actually a careers/jobs page rather than some
// unrelated page that happens to mention the job title.
const CAREER_URL_SIGNALS = [
  "career",
  "careers",
  "jobs",
  "job-openings",
  "vacanc", // vacancy / vacancies
  "recruitment",
  "join-us",
  "join-our-team",
  "work-with-us"
];

const KNOWN_ATS_HOSTS = [
  "boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "myworkdayjobs.com",
  "jobs.smartrecruiters.com"
];

function excludeClause() {
  return AGGREGATORS_TO_EXCLUDE.map((d) => `-site:${d}`).join(" ");
}

function buildQueries(jobTitle, country) {
  const title = `"${jobTitle}"`;
  const loc = country ? `"${country}"` : "";
  const exclude = excludeClause();

  return [
    // Known ATS platforms — these return clean structured job data in the
    // extraction step, so surfacing them is the highest-value part of discovery.
    { source: "greenhouse", query: `site:boards.greenhouse.io ${title} ${loc}` },
    { source: "lever", query: `site:jobs.lever.co ${title} ${loc}` },
    { source: "ashby", query: `site:jobs.ashbyhq.com ${title} ${loc}` },
    { source: "workday", query: `site:myworkdayjobs.com ${title} ${loc}` },
    { source: "smartrecruiters", query: `site:jobs.smartrecruiters.com ${title} ${loc}` },
    // Company-owned career pages only: forces "careers" in the URL itself,
    // and excludes every aggregator/social platform explicitly.
    {
      source: "custom",
      query: `${title} ${loc} inurl:careers OR inurl:jobs ${exclude}`
    }
  ];
}

function isLikelyCareerPage(url, source) {
  let host, path;
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "").toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return false;
  }

  // Hard block: never accept these regardless of source.
  if (BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) {
    return false;
  }

  // Known ATS platforms are always acceptable — they're career-only domains.
  if (KNOWN_ATS_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) {
    return true;
  }

  // For general/custom discovery, require an actual career/job signal
  // somewhere in the URL — otherwise it's likely an unrelated page.
  if (source === "custom") {
    return CAREER_URL_SIGNALS.some((s) => path.includes(s) || host.includes(s));
  }

  return true;
}

async function serpApiSearch(query, apiKey, numResults = 20, country = "") {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(numResults));
  url.searchParams.set("api_key", apiKey);
  // Biases Google itself toward that country/region, on top of the text
  // match in the query — this cuts down on irrelevant-country results
  // much more than the query text alone.
  if (country) {
    url.searchParams.set("location", country);
    url.searchParams.set("google_domain", "google.com");
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`SerpApi request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return (data.organic_results || []).map((r) => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet
  }));
}

async function discoverCandidateUrls(jobTitle, country, apiKey, numResults = 20) {
  const queries = buildQueries(jobTitle, country);
  const results = [];

  for (const { source, query } of queries) {
    try {
      const found = await serpApiSearch(query, apiKey, numResults, country);
      for (const item of found) {
        if (isLikelyCareerPage(item.link, source)) {
          results.push({ ...item, source });
        }
      }
    } catch (err) {
      // One failing query shouldn't kill the whole discovery pass.
      console.error(`Discovery query failed [${source}]:`, err.message);
    }
  }

  // Dedupe by URL.
  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  });
}

module.exports = { discoverCandidateUrls, buildQueries, isLikelyCareerPage };
