const admin = require("firebase-admin");

let app;

function getApp() {
  if (app) return app;

  // Service account JSON is stored as a single env var (stringified) so it
  // works cleanly with Vercel's environment variable UI.
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  return app;
}

function db() {
  getApp();
  return admin.firestore();
}

// Jobs are keyed by a hash of their link so re-running the same search
// doesn't create duplicates — it just tells you what's already been seen.
function jobId(link) {
  return Buffer.from(link).toString("base64url").slice(0, 200);
}

async function saveJobsAndFlagNew(jobs, searchMeta) {
  const firestore = db();
  const batch = firestore.batch();
  const results = [];

  for (const job of jobs) {
    const id = jobId(job.link);
    const ref = firestore.collection("jobs").doc(id);
    const existing = await ref.get();
    const isNew = !existing.exists;

    batch.set(
      ref,
      {
        ...job,
        searchKeyword: searchMeta.jobTitle,
        searchCountry: searchMeta.country,
        firstSeenAt: isNew ? admin.firestore.FieldValue.serverTimestamp() : existing.data().firstSeenAt,
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    results.push({ ...job, isNew });
  }

  await batch.commit();
  return results;
}

module.exports = { saveJobsAndFlagNew };
