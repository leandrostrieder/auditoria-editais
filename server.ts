import express from "express";
import { OAuth2Client } from "google-auth-library";
import cookieSession from "cookie-session";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("Starting Express server...");
  
  const requiredEnv = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GEMINI_API_KEY"];
  const missing = requiredEnv.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`⚠️ Warning: Missing environment variables: ${missing.join(", ")}`);
    console.warn("Google Login and Gemini AI features may not work correctly.");
  }

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(
    cookieSession({
      name: "session",
      keys: [process.env.SESSION_SECRET || "smartgen-secret-key"],
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: true,
      sameSite: "none",
    })
  );

  // API Routes
  app.get("/api/auth/google/url", (req, res) => {
    console.log("Request received for /api/auth/google/url");
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientID || !clientSecret) {
      console.error("Missing Google OAuth credentials");
      return res.status(500).json({ error: "Google OAuth credentials not configured" });
    }

    const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const redirectUri = `${baseUrl}/auth/google/callback`;
    const oauthClient = new OAuth2Client(clientID, clientSecret, redirectUri);

    const prompt = req.query.prompt as string | undefined;

    const url = oauthClient.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      // Se prompt não for passado, o Google tentará usar a sessão existente sem forçar seleção
      ...(prompt ? { prompt } : {}),
    });
    res.json({ url });
  });

  app.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
      const redirectUri = `${baseUrl}/auth/google/callback`;
      const oauthClient = new OAuth2Client(clientID, clientSecret, redirectUri);

      const { tokens } = await oauthClient.getToken(code as string);
      oauthClient.setCredentials(tokens);

      const ticket = await oauthClient.verifyIdToken({
        idToken: tokens.id_token!,
        audience: clientID,
      });

      const payload = ticket.getPayload();
      console.log("Authenticated user:", payload?.email);

      if (req.session) {
        req.session.user = {
          id: payload?.sub,
          name: payload?.name,
          email: payload?.email,
          picture: payload?.picture,
        };
        // Ensure session is saved before sending response
      }

      res.send(`
        <html>
          <body>
            <script>
              console.log("Sending OAUTH_AUTH_SUCCESS message...");
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 500);
              } else {
                window.location.href = '/';
              }
            </script>
            <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
              <h2 style="color: #059669;">Autenticação concluída!</h2>
              <p>Esta janela fechará automaticamente em instantes...</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error during Google OAuth callback:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.session?.user || null });
  });

  app.get("/api/config", (req, res) => {
    // Só envia a chave se houver um usuário autenticado (segurança básica)
    if (req.session?.user) {
      res.json({ 
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.API_KEY || "" 
      });
    } else {
      res.status(401).json({ error: "Não autenticado" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    if (req.session) {
      req.session = null;
    }
    res.json({ success: true });
  });

  // Health check
  app.get("/api/health", (req, res) => {
    console.log("Health check requested");
    res.json({ status: "ok" });
  });

  // Global error handler for API routes
  app.use("/api", (err: any, req: any, res: any, next: any) => {
    console.error("API Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
