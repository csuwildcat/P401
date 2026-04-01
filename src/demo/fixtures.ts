import { buildDemoActor } from "../core/dids.js";

export const DEMO_CONSTANTS = {
  paperPath: "/papers/medical-study-123",
  paperId: "medical-study-123",
  credentialConfigurationId: "BoardCertificationCredential",
  preAuthorizedCode: "demo-board-cert-preauth-code",
  accessToken: "demo-board-cert-access-token",
  statusListIndex: 0,
  statusListSize: 128,
  issuedAt: "2026-01-01T00:00:00Z",
  credentialExpiresAt: "2028-01-01T00:00:00Z",
  delegationExpiresAt: "2026-12-31T23:59:59Z",
  receiptLifetimeSeconds: 900,
} as const;

const ACTOR_KEYS = {
  doctor: {
    publicJwk: {
      crv: "Ed25519",
      x: "cLnavHOb3CUFuLW41F6Z3YGmDxdSuk-LO2tMKN5gzlY",
      kty: "OKP",
    },
    privateJwk: {
      crv: "Ed25519",
      d: "xK3AKDo03tfMQj6kuVt22NwOJnaA8Izxe70_e9tC0pE",
      x: "cLnavHOb3CUFuLW41F6Z3YGmDxdSuk-LO2tMKN5gzlY",
      kty: "OKP",
    },
  },
  agent: {
    publicJwk: {
      crv: "Ed25519",
      x: "mf9CDgT5QDyXftVMohoQRyv8MBglT15eGg8iDsPr9Ac",
      kty: "OKP",
    },
    privateJwk: {
      crv: "Ed25519",
      d: "T3aVcm-2q7acELwrPpnwaVoK9_rBfGwMjQ5b5FDySrY",
      x: "mf9CDgT5QDyXftVMohoQRyv8MBglT15eGg8iDsPr9Ac",
      kty: "OKP",
    },
  },
  issuer: {
    publicJwk: {
      crv: "Ed25519",
      x: "AeINl3VmB5e6R1r9H8ssW9rjjfKNGZdXH9PBecuEuhM",
      kty: "OKP",
    },
    privateJwk: {
      crv: "Ed25519",
      d: "LapwDZUI2SqDCX5gSZlkIwOcbTiCHjji4YPQ4Fbll_E",
      x: "AeINl3VmB5e6R1r9H8ssW9rjjfKNGZdXH9PBecuEuhM",
      kty: "OKP",
    },
  },
  relyingParty: {
    publicJwk: {
      crv: "Ed25519",
      x: "4g5_e7rii76aSvhaDpMTjBKTfVRkuC9nO2nHPuczTok",
      kty: "OKP",
    },
    privateJwk: {
      crv: "Ed25519",
      d: "JVqbPYx1ge6-ZeeQDSh1LEaQpNMMoUpLr6qRL382pPg",
      x: "4g5_e7rii76aSvhaDpMTjBKTfVRkuC9nO2nHPuczTok",
      kty: "OKP",
    },
  },
} as const;

export function createDemoActors(baseUrl: string) {
  return {
    doctor: buildDemoActor({
      baseUrl,
      id: "doctor",
      slug: "doctor",
      label: "Dr. Amelia Stone",
      role: "Individual holder and physician",
      publicJwk: ACTOR_KEYS.doctor.publicJwk,
      privateJwk: ACTOR_KEYS.doctor.privateJwk,
    }),
    agent: buildDemoActor({
      baseUrl,
      id: "agent",
      slug: "ai-agent",
      label: "Research Access Agent",
      role: "AI agent acting on the doctor's behalf",
      publicJwk: ACTOR_KEYS.agent.publicJwk,
      privateJwk: ACTOR_KEYS.agent.privateJwk,
    }),
    issuer: buildDemoActor({
      baseUrl,
      id: "issuer",
      slug: "issuer",
      label: "Texas Medical Board",
      role: "Credential issuer",
      publicJwk: ACTOR_KEYS.issuer.publicJwk,
      privateJwk: ACTOR_KEYS.issuer.privateJwk,
    }),
    relyingParty: buildDemoActor({
      baseUrl,
      id: "relyingParty",
      slug: "relying-party",
      label: "Open Medical Research Archive",
      role: "Relying party and verifier",
      publicJwk: ACTOR_KEYS.relyingParty.publicJwk,
      privateJwk: ACTOR_KEYS.relyingParty.privateJwk,
    }),
  };
}

export function getProtectedPaper() {
  return {
    id: DEMO_CONSTANTS.paperId,
    path: DEMO_CONSTANTS.paperPath,
    title: "Cardiometabolic Recovery Patterns in Remote Monitoring Cohorts",
    summary:
      "A synthetic research paper used to demonstrate route gating for active board-certified physicians.",
    accessPolicy: "Free for active board-certified doctors.",
    sections: [
      "Overview of the cohort design and remote telemetry capture.",
      "Findings on post-intervention recovery timing across clinical subgroups.",
      "Appendix with a synthetic methods packet for the demo.",
    ],
  };
}

