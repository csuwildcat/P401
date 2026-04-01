import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { DemoService } from "./demo/service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const publicSiteDir = path.join(repoRoot, "public", "site");
const publicDemoDir = path.join(repoRoot, "public", "demo");
const nodeModulesDir = path.join(repoRoot, "node_modules");
const mermaidDistDir = path.join(nodeModulesDir, "mermaid", "dist");
const builtSpecDir = path.join(repoRoot, "www", "spec");

const port = Number(process.env.PORT ?? 4010);
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;

const service = await DemoService.create(baseUrl);
const app = express();
const DEMO_ROUTE = "/papers/medical-study-123";

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

if (fs.existsSync(builtSpecDir)) {
  app.use("/spec", express.static(builtSpecDir));
}

app.use("/demo/vendor", express.static(nodeModulesDir));
app.use("/vendor/mermaid", express.static(mermaidDistDir));
app.use("/demo", express.static(publicDemoDir));
app.use(express.static(publicSiteDir));

function isLoopbackAddress(ip: string | undefined) {
  if (!ip) {
    return false;
  }

  return (
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("127.0.0.1")
  );
}

function extractBearerToken(headerValue: string | undefined) {
  if (!headerValue?.startsWith("Bearer ")) {
    return null;
  }

  return headerValue.slice("Bearer ".length);
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicSiteDir, "index.html"));
});

app.get("/demo/api/overview", (_req, res) => {
  res.json(service.getOverview());
});

app.get("/demo/api/challenges/:challengeId", (req, res) => {
  const challenge = service.getChallenge(req.params.challengeId);
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }

  res.json(challenge);
});

app.post("/demo/api/challenges/:challengeId/submit", async (req, res) => {
  try {
    const result = await service.submitStoredPresentation(req.params.challengeId);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to submit presentation",
    });
  }
});

app.get("/actors/:slug/did.json", (req, res) => {
  const didDocument = service.getDidDocumentBySlug(req.params.slug);
  if (!didDocument) {
    res.status(404).json({ error: "Unknown actor DID document" });
    return;
  }

  res.type("application/did+json").json(didDocument);
});

app.get("/issuer/.well-known/openid-credential-issuer", (_req, res) => {
  res.json(service.getCredentialIssuerMetadata());
});

app.get("/issuer/oauth/.well-known/openid-configuration", (_req, res) => {
  res.json(service.getAuthorizationServerMetadata());
});

app.get("/issuer/credential-offers/board-certification", (_req, res) => {
  res.json(service.getCredentialOfferObject());
});

app.post("/issuer/oauth/token", async (req, res) => {
  try {
    const preAuthorizedCode =
      req.body["pre-authorized_code"] ??
      req.body.pre_authorized_code ??
      req.body.preAuthorizedCode;
    const tokenResponse = await service.exchangePreAuthorizedCode(preAuthorizedCode);
    res.json(tokenResponse);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Token exchange failed",
    });
  }
});

app.post("/issuer/credential", async (req, res) => {
  try {
    const accessToken = extractBearerToken(req.header("authorization"));
    const credentialResponse = await service.retrieveIssuedCredential(accessToken ?? undefined);
    res.json(credentialResponse);
  } catch (error) {
    res.status(401).json({
      error: error instanceof Error ? error.message : "Credential request failed",
    });
  }
});

app.get("/issuer/status-lists/board-certifications", (_req, res) => {
  res.type("application/vc+jwt").send(service.getStatusListCredentialJwt());
});

app.get("/verifier/oidc/requests/:challengeId", (req, res) => {
  const challenge = service.getChallenge(req.params.challengeId);
  if (!challenge) {
    res.status(404).send("unknown challenge");
    return;
  }

  res
    .type("application/oauth-authz-req+jwt")
    .send(challenge.requestObjectJwt);
});

app.post("/verifier/oidc/direct-post/:challengeId", async (req, res) => {
  try {
    const result = await service.completeOidcDirectPost(
      req.params.challengeId,
      req.body as Record<string, unknown>,
    );
    res.json(result);
  } catch (error) {
    res.status(403).json({
      error:
        error instanceof Error ? error.message : "Verifier rejected the presentation",
    });
  }
});

app.post("/local-agent/wallet/presentations/:challengeId", async (req, res) => {
  if (!isLoopbackAddress(req.ip)) {
    res.status(403).json({
      error: "The local wallet endpoint is restricted to loopback access for the demo",
    });
    return;
  }

  try {
    const result = await service.createLocalPresentation(req.params.challengeId);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create presentation",
    });
  }
});

app.get(DEMO_ROUTE, async (req, res) => {
  const receiptToken = extractBearerToken(req.header("authorization"));

  if (receiptToken) {
    try {
      await service.verifyReceiptToken(receiptToken, DEMO_ROUTE, "GET");
      res.json(service.getAuthorizedPaperResponse());
      return;
    } catch (error) {
      res.status(403).json({
        error:
          error instanceof Error ? error.message : "The verifier receipt is invalid",
      });
      return;
    }
  }

  const challenge = await service.createPaperChallenge();
  res
    .status(401)
    .setHeader("WWW-Authenticate", challenge.wwwAuthenticate)
    .setHeader("Cache-Control", "no-store")
    .json(challenge.envelope);
});

app.listen(port, () => {
  console.log(`P401 demo listening on ${baseUrl}`);
});
