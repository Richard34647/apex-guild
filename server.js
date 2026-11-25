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

// 2. Serve frontend files
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

// 4. Route to Proxy GamesKinbo API
app.get("/api/garena/:endpoint", async (req, res) => {
  const apiKey = process.env.GARENA_API_KEY;
  // Hardcoded correct endpoint for GamesKinbo
  const baseUrl = "https://api.gameskinbo.com"; 
  const endpoint = "ff-info/get"; // GamesKinbo's specific endpoint

  if (!apiKey) {
    return res.status(500).json({ error: "GARENA_API_KEY missing." });
  }

  const upstream = new URL(`${baseUrl}/${endpoint}`);
  
  // Pass query parameters (region, uid)
  Object.entries(req.query).forEach(([k, v]) => {
    upstream.searchParams.set(k, String(v));
  });

  try {
    const response = await fetch(upstream.toString(), {
      headers: {
        "x-api-key": apiKey, // GamesKinbo requires this exact header
        "Accept": "application/json"
      }
    });
    
    // Check if GamesKinbo returned HTML (error page)
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      res.status(response.status).json(data);
    } catch (parseError) {
      // If it's not JSON, send a helpful error
      res.status(500).json({ 
        error: "GamesKinbo returned HTML instead of JSON. Check your API key and endpoint.",
        raw: text.substring(0, 100) // Show a snippet of the HTML error
      });
    }
  } catch (err) {
    res.status(502).json({ error: "Upstream failed", detail: err.message });
  }
});

// 5. Catch-all to serve index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
