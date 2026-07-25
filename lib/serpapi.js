// Discovery layer.
// Instead of one broad web search, we run several *targeted* queries:
//   - one per major ATS platform (Greenhouse, Lever, Ashby, Workday, SmartRecruiters)
//   - one general query aimed at company domains, explicitly excluding aggregators
//     and social media
// This surfaces links that live on the company's own hiring page/ATS instance —
// never job boards, never social media, never news/blog posts.

const AGGREGATORS_TO_EXCLUDE = [
  // Global majors
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "simplyhired.com",
  "ziprecruiter.com",
  "monster.com",
  "careerbuilder.com",
  "adzuna.com",
  "jooble.org",
  "trovit.com",
  "neuvoo.com",
  "talent.com",
  "jora.com",
  "snagajob.com",
  "jobvertise.com",
  "craigslist.org",
  "flexjobs.com",
  "wellfound.com",
  "angel.co",
  "dice.com",
  "builtin.com",
  "themuse.com",
  "weworkremotely.com",
  "remote.co",
  "idealist.org",
  "handshake.com",
  // Gulf / Middle East
  "naukrigulf.com",
  "bayt.com",
  "gulftalent.com",
  "talentmate.com",
  "akhtaboot.com",
  "laimoon.com",
  "drjobs.ae",
  "dubizzle.com",
  "monstergulf.com",
  "mustakbil.com",
  "michaelpage.ae",
  "michaelpage.com",
  "recruit.net",
  "careerjet.com",
  // South Asia
  "naukri.com",
  "shine.com",
  "timesjobs.com",
  "foundit.in",
  "monsterindia.com",
  "rozee.pk",
  "wisdomjobs.com",
  "freshersworld.com",
  "internshala.com",
  // Southeast Asia / APAC
  "jobstreet.com",
  "jobsdb.com",
  "seek.com.au",
  "seek.com",
  // Europe
  "reed.co.uk",
  "totaljobs.com",
  "cv-library.co.uk",
  "stepstone.com",
  "stepstone.de",
  "xing.com",
  "jobindex.dk",
  "infojobs.net",
  "apec.fr",
  "pole-emploi.fr",
  // Government/public aggregators (still aggregators, not a single company)
  "usajobs.gov",
  // Marketplace/classifieds sometimes indexed for jobs
  "olx.com",
  "gumtree.com",
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
  "vacanc",
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

const COUNTRY_TO_GL = {
  "uae": "ae",
  "united arab emirates": "ae",
  "saudi arabia": "sa",
  "ksa": "sa",
  "qatar": "qa",
  "bahrain": "bh",
  "kuwait": "kw",
  "oman": "om",
  "pakistan": "pk",
  "india": "in",
  "bangladesh": "bd",
  "philippines": "ph",
  "egypt": "eg",
  "jordan": "jo",
  "lebanon": "lb",
  "united kingdom": "uk",
  "uk": "uk",
  "united states": "us",
  "usa": "us",
  "us": "us",
  "canada": "ca",
  "australia": "au",
  "germany": "de",
  "france": "fr",
  "singapore": "sg",
  "malaysia": "my",
  "south africa": "za",
  "nigeria": "ng",
  "kenya": "ke"
};

function countryToGl(country) {
  if (!country) return null;
  return COUNTRY_TO_GL[country.trim().toLowerCase()] || null;
}

function formatGoogleDate(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function recentDateRangeParam(days = 10) {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - days);
  return `cdr:1,cd_min:${formatGoogleDate(past)},cd_max:${formatGoogleDate(today)}`;
}

function excludeClause() {
  return AGGREGATORS_TO_EXCLUDE.map((d) => `-site:${d}`).join(" ");
}

function buildQueries(jobTitle, country) {
  const title = `"${jobTitle}"`;
  const loc = country ? `"${country}"` : "";
  const exclude = excludeClause();

  return [
    { source: "greenhouse", query: `site:boards.greenhouse.io ${title} ${loc}` },
    { source: "lever", query: `site:jobs.lever.co ${title} ${loc}` },
    { source: "ashby", query: `site:jobs.ashbyhq.com ${title} ${loc}` },
    { source: "workday", query: `site:myworkdayjobs.com ${title} ${loc}` },
    { source: "smartrecruiters", query: `site:jobs.smartrecruiters.com ${title} ${loc}` },
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

  if (BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) {
    return false;
  }

  if (KNOWN_ATS_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) {
    return true;
  }

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

  const gl = countryToGl(country);
  if (gl) {
    url.searchParams.set("gl", gl);
  }

  url.searchParams.set("tbs", recentDateRangeParam(10));

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
      console.error(`Discovery query failed [${source}]:`, err.message);
    }
  }

  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  });
}

module.exports = { discoverCandidateUrls, buildQueries, isLikelyCareerPage, countryToGl };
