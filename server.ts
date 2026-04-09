import express from "express";
import cookieParser from "cookie-parser";
import axios from "axios";
import jwt from "jsonwebtoken";
import path from "path";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

const PKCE_COOKIE = "meli_pkce_verifier";
const COOKIE_SECURE = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

app.use(express.json());
app.use(cookieParser());

const MELI_API_URL = "https://api.mercadolibre.com";

function usePkceFlow() {
  return process.env.MELI_USE_PKCE !== "false";
}

function generatePkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

function pkceCookieOptions(): express.CookieOptions {
  return {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60 * 1000,
  };
}

function requestOrigin(req: express.Request) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  return { proto, host, callbackUrl: `${proto}://${host}/auth/callback` };
}

// OAuth redirect_uri must match the host where the PKCE cookie was set (same browser origin).
// If APP_URL is a different host (e.g. production URL while testing on a Vercel preview), use this request's host.
function getRedirectUri(req: express.Request) {
  const { host, callbackUrl } = requestOrigin(req);
  const raw = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (!raw) {
    return callbackUrl;
  }
  try {
    const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
    const app = new URL(normalized);
    if (app.host === host) {
      return `${app.origin}/auth/callback`;
    }
  } catch {
    // ignore invalid APP_URL
  }
  return callbackUrl;
}

// 1. Auth URL Endpoint
app.get("/api/auth/url", (req, res) => {
  const redirectUri = getRedirectUri(req);
  const clientId = process.env.MELI_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({ error: "MELI_CLIENT_ID is not configured" });
  }

  let authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  if (usePkceFlow()) {
    const { codeVerifier, codeChallenge } = generatePkcePair();
    res.cookie(PKCE_COOKIE, codeVerifier, pkceCookieOptions());
    authUrl += `&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
  }

  res.json({ url: authUrl });
});

// 2. Callback Endpoint
app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const { code } = req.query;
  const redirectUri = getRedirectUri(req);
  const clientId = process.env.MELI_CLIENT_ID;
  const clientSecret = process.env.MELI_CLIENT_SECRET;
  const jwtSecret = process.env.JWT_SECRET || "default_secret_for_dev";

  if (!code) {
    return res.status(400).send("No code provided");
  }

  const clearPkce = () => res.clearCookie(PKCE_COOKIE, { path: "/", secure: COOKIE_SECURE, sameSite: "lax" });

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId!,
      client_secret: clientSecret!,
      code: code as string,
      redirect_uri: redirectUri,
    });

    if (usePkceFlow()) {
      const codeVerifier = req.cookies[PKCE_COOKIE];
      if (!codeVerifier) {
        return res.status(400).send("PKCE session missing: open login from this site again.");
      }
      body.append("code_verifier", codeVerifier);
    }

    const tokenResponse = await axios.post("https://api.mercadolibre.com/oauth/token", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    });

    clearPkce();

    const { access_token, refresh_token, user_id, expires_in } = tokenResponse.data;

    // Create JWT
    const token = jwt.sign({ access_token, refresh_token, user_id }, jwtSecret, { expiresIn: "1d" });

    // Set cookie
    res.cookie("meli_session", token, {
      secure: true,
      sameSite: "none",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    clearPkce();
    console.error("OAuth Error:", error.response?.data || error.message);
    res.status(500).send("Authentication failed");
  }
});

// Middleware to check auth
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.meli_session;
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const jwtSecret = process.env.JWT_SECRET || "default_secret_for_dev";
    const decoded = jwt.verify(token, jwtSecret) as any;
    (req as any).meli = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid session" });
  }
};

// API to check auth status
app.get("/api/auth/status", (req, res) => {
  const token = req.cookies.meli_session;
  if (!token) {
    return res.json({ authenticated: false });
  }
  try {
    const jwtSecret = process.env.JWT_SECRET || "default_secret_for_dev";
    jwt.verify(token, jwtSecret);
    res.json({ authenticated: true });
  } catch (err) {
    res.json({ authenticated: false });
  }
});

// API to logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("meli_session", {
    secure: true,
    sameSite: "none",
    httpOnly: true
  });
  res.json({ success: true });
});

// Webhook endpoint for Mercado Libre notifications
app.post("/api/notifications", (req, res) => {
  console.log("Received ML notification:", req.body);
  res.status(200).send("OK");
});

// Proxy endpoints for Mercado Libre API
app.get("/api/meli/user", requireAuth, async (req, res) => {
  try {
    const { access_token } = (req as any).meli;
    const response = await axios.get(`${MELI_API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to fetch user" });
  }
});

app.get("/api/meli/items", requireAuth, async (req, res) => {
  try {
    const { access_token, user_id } = (req as any).meli;
    const searchRes = await axios.get(`${MELI_API_URL}/users/${user_id}/items/search`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    
    const itemIds = searchRes.data.results || [];
    if (itemIds.length === 0) {
      return res.json([]);
    }

    const idsToFetch = itemIds.slice(0, 20).join(",");
    const itemsRes = await axios.get(`${MELI_API_URL}/items?ids=${idsToFetch}`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const items = itemsRes.data.map((i: any) => i.body);
    res.json(items);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to fetch items" });
  }
});

app.get("/api/meli/orders", requireAuth, async (req, res) => {
  try {
    const { access_token, user_id } = (req as any).meli;
    const response = await axios.get(`${MELI_API_URL}/orders/search?seller=${user_id}&sort=date_desc`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    res.json(response.data.results || []);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to fetch orders" });
  }
});

app.get("/api/meli/visits", requireAuth, async (req, res) => {
  try {
    const { access_token, user_id } = (req as any).meli;
    const dateTo = new Date().toISOString().split("T")[0];
    const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const response = await axios.get(`${MELI_API_URL}/users/${user_id}/items_visits`, {
      params: { date_from: dateFrom, date_to: dateTo },
      headers: { Authorization: `Bearer ${access_token}` }
    });
    res.json(response.data);
  } catch (error: any) {
    console.error("Visits error:", error.response?.data);
    res.json({ results: [] });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// In Vercel, this file is executed as a serverless handler.
if (!process.env.VERCEL) {
  startServer();
}

export default app;
