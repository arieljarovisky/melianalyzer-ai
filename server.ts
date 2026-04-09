import express from "express";
import cookieParser from "cookie-parser";
import axios from "axios";
import jwt from "jsonwebtoken";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const MELI_API_URL = "https://api.mercadolibre.com";

// Helper to get redirect URI
function getRedirectUri(req: express.Request) {
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    return `${appUrl}/auth/callback`;
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  return `${protocol}://${req.headers.host}/auth/callback`;
}

// 1. Auth URL Endpoint
app.get("/api/auth/url", (req, res) => {
  const redirectUri = getRedirectUri(req);
  const clientId = process.env.MELI_CLIENT_ID;
  
  if (!clientId) {
    return res.status(500).json({ error: "MELI_CLIENT_ID is not configured" });
  }

  const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  
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

  try {
    const tokenResponse = await axios.post("https://api.mercadolibre.com/oauth/token", new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId!,
      client_secret: clientSecret!,
      code: code as string,
      redirect_uri: redirectUri
    }), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      }
    });

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
    const dateTo = new Date().toISOString().split('T')[0];
    const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const response = await axios.get(`${MELI_API_URL}/users/${user_id}/items_visits?date_from=${dateFrom}T00:00:00.000-00:00&date_to=${dateTo}T00:00:00.000-00:00`, {
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
