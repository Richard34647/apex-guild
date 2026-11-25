const express = require("express");
const path = require("path");
const admin = require("firebase-admin");

const app = express();
app.use(express.json());

// 1. Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// 2. Serve your frontend files from the ROOT folder
app.use(express.static(__dirname));

// 3. Route to set Admin Claim
app.get("/api/setAdmin", async (req, res) => {
  const { uid, key } = req.query;
  const setupSecret = process.env.SETUP_SECRET; 

  if (!setupSecret) return res.status(500).send("Missing SETUP_SECRET environment variable.");
  if (key !== setupSecret) return res.status(403).send("Forbidden.");

  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    return res.send(`Admin claim set for ${uid}. Sign out and sign back in.`);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Failed to set claim.");
  }
});

// 4. Route to Proxy Garena API
app.get("/api/garena/:endpoint", async (req, res) => {
  const apiKey = process.env.GARENA_API_KEY;
  const baseUrl = process.env.GARENA_BASE_URL;

  if (!apiKey || !baseUrl) {
    return res.status(500).json({ error: "Garena API env vars missing." });
  }

  const endpointMap = { player: "info", clan: "clan", guild: "clan" };
  const endpoint = endpointMap[req.params.endpoint] || req.params.endpoint;

  const upstream = new URL(baseUrl.replace(/\/+$/, "") + "/" + endpoint);
  Object.entries(req.query).forEach(([k, v]) => {
    upstream.searchParams.set(k, String(v));
  });

  try {
    const response = await fetch(upstream.toString(), {
      headers: {
        "x-api-key": apiKey,
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json"
      }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Upstream failed", detail: err.message });
  }
});

// 5. Catch-all to serve index.html from the ROOT folder
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
