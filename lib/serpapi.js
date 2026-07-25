// Discovery layer.
// Instead of one broad web search, we run several *targeted* queries:
//   - one per major ATS platform (Greenhouse, Lever, Ashby, Workday, SmartRecruiters)
//   - one general query aimed at company domains, explicitly excluding aggregators
// This surfaces links that live on the company's own hiring page/ATS instance,
// never on LinkedIn/Indeed/Naukrigulf/Bayt/Glassdoor.

const AGGREGATORS_TO_EXCLUDE = [
  "linkedin.com",
  "indeed.com",
  "naukrigulf.com",
  "bayt.com",
  "glassdoor.com",
  "monsterindia.com",
  "gulftalent.com",
  "simplyhired.com",
  "ziprecruiter.com"
];

function excludeClause() {
  return AGGREGATORS_TO_EXCLUDE.map((d) => `-site:${d}`).join(" ");
}

function buildQueries(jobTitle, country) {
  const title = `"${jobTitle}"`;
  const loc = country ? `"${country}"` : "";

  return [
    // Known ATS platforms — these return clean structured job data in the
    // extraction step, so surfacing them is the highest-value part of discovery.
    { source: "greenhouse", query: `site:boards.greenhouse.io ${title} ${loc}` },
    { source: "lever", query: `site:jobs.lever.co ${title} ${loc}` },
    { source: "ashby", query: `site:jobs.ashbyhq.com ${title} ${loc}` },
    { source: "workday", query: `site:myworkdayjobs.com ${title} ${loc}` },
    { source: "smartrecruiters", query: `site:jobs.smartrecruiters.com ${title} ${loc}` },
    // General "careers" pages on company-owned domains, excluding aggregators.
    {
      source: "custom",
      query: `${title} jobs careers ${loc} inurl:careers ${excludeClause()}`
    }
  ];
}

async function serpApiSearch(query, apiKey, numResults = 20) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(numResults));
  url.searchParams.set("api_key", apiKey);

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

async function discoverCandidateUrls(jobTitle, country, apiKey) {
  const queries = buildQueries(jobTitle, country);
  const results = [];

  for (const { source, query } of queries) {
    try {
      const found = await serpApiSearch(query, apiKey, 20);
      for (const item of found) {
        results.push({ ...item, source });
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

module.exports = { discoverCandidateUrls, buildQueries };
