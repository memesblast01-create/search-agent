const { discoverCandidateUrls } = require("../lib/serpapi");
const { extractJobs } = require("../lib/scrapers");
const { saveJobsAndFlagNew } = require("../lib/firebase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const { jobTitle, country } = req.body || {};
  if (!jobTitle) {
    res.status(400).json({ error: "jobTitle is required" });
    return;
  }

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "SERPAPI_KEY is not configured" });
    return;
  }

  try {
    const candidates = await discoverCandidateUrls(jobTitle, country, apiKey);
    const jobs = await extractJobs(candidates, jobTitle);

    let saved = jobs;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      saved = await saveJobsAndFlagNew(jobs, { jobTitle, country });
    }

    res.status(200).json({
      query: { jobTitle, country },
      candidatesFound: candidates.length,
      jobsExtracted: saved.length,
      jobs: saved
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
