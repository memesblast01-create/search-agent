const { discoverCandidateUrls } = require("../lib/serpapi");
const { extractJobs } = require("../lib/scrapers");
const { saveJobsAndFlagNew } = require("../lib/firebase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const { jobTitle, country, resultsWanted } = req.body || {};
  if (!jobTitle) {
    res.status(400).json({ error: "jobTitle is required" });
    return;
  }

  const maxResults = Math.min(Math.max(Number(resultsWanted) || 10, 5), 50);

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "SERPAPI_KEY is not configured" });
    return;
  }

  try {
    const candidates = await discoverCandidateUrls(jobTitle, country, apiKey, maxResults);
    const jobs = await extractJobs(candidates, jobTitle, country, maxResults);

    let responseJobs = jobs;
    let alreadySeenCount = 0;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const tagged = await saveJobsAndFlagNew(jobs, { jobTitle, country });
      responseJobs = tagged.filter((j) => j.isNew);
      alreadySeenCount = tagged.length - responseJobs.length;
    }

    res.status(200).json({
      query: { jobTitle, country },
      candidatesFound: candidates.length,
      jobsExtracted: responseJobs.length,
      alreadySeenFiltered: alreadySeenCount,
      jobs: responseJobs
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
