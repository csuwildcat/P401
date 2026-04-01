import { randomUUID } from "node:crypto";
import type { CredentialIssuerMetadata } from "@openid4vc/openid4vci";
import type { Openid4vpAuthorizationResponse } from "@openid4vc/openid4vp";
import { createOid4vcCallbacks, decodeJsonJwtPayload, signJsonJwt, verifyJsonJwt } from "../core/crypto.js";
import { buildDidDocument, createLocalDidResolver } from "../core/dids.js";
import { buildMedicalStudyEnvelope, buildP401AuthenticateHeader } from "../core/p401.js";
import { createEncodedStatusList, createStatusListEntry, isStatusListRevoked } from "../core/status-list.js";
import type {
  ChallengeRecord,
  DemoActor,
  DemoDataset,
  VerificationSummary,
} from "../core/types.js";
import {
  createCredentialJwt,
  createPresentationJwt,
  decodeDidJwt,
  verifyCredentialJwt,
  verifyPresentationJwt,
} from "../core/vc.js";
import { createDemoActors, DEMO_CONSTANTS, getProtectedPaper } from "./fixtures.js";

type ActorMap = ReturnType<typeof createDemoActors>;

export class DemoService {
  readonly baseUrl: string;
  readonly actors: ActorMap;
  readonly callbacks: ReturnType<typeof createOid4vcCallbacks>;
  readonly didResolver: ReturnType<typeof createLocalDidResolver>;
  readonly paper = getProtectedPaper();

  private readonly challenges = new Map<string, ChallengeRecord>();
  private readonly dataset: DemoDataset;
  private readonly credentialIssuerMetadata: CredentialIssuerMetadata;
  private readonly credentialOfferObject: Record<string, unknown>;
  private readonly credentialOffer: string;
  private readonly authorizationServerMetadata: Record<string, unknown>;

  static async create(baseUrl: string): Promise<DemoService> {
    const actors = createDemoActors(baseUrl);
    const callbacks = createOid4vcCallbacks(Object.values(actors));
    const didResolver = createLocalDidResolver(Object.values(actors));
    const service = new DemoService(baseUrl, actors, callbacks, didResolver);

    await service.initialize();
    return service;
  }

  private constructor(
    baseUrl: string,
    actors: ActorMap,
    callbacks: ReturnType<typeof createOid4vcCallbacks>,
    didResolver: ReturnType<typeof createLocalDidResolver>,
  ) {
    this.baseUrl = baseUrl;
    this.actors = actors;
    this.callbacks = callbacks;
    this.didResolver = didResolver;

    this.dataset = {
      statusListCredentialJwt: "",
      boardCertificationCredentialJwt: "",
      delegationCredentialJwt: "",
      statusListEncoded: "",
      statusListCredentialUrl: `${baseUrl}/issuer/status-lists/board-certifications`,
      credentialOfferUri: `${baseUrl}/issuer/credential-offers/board-certification`,
      credentialIssuer: `${baseUrl}/issuer`,
      authorizationServer: `${baseUrl}/issuer/oauth`,
    };

    this.authorizationServerMetadata = {
      issuer: `${baseUrl}/issuer/oauth`,
      token_endpoint: `${baseUrl}/issuer/oauth/token`,
      credential_endpoint: `${baseUrl}/issuer/credential`,
      grant_types_supported: [
        "urn:ietf:params:oauth:grant-type:pre-authorized_code",
      ],
      response_types_supported: ["token"],
      token_endpoint_auth_methods_supported: ["none"],
    };

    this.credentialIssuerMetadata = {
      credential_issuer: this.dataset.credentialIssuer,
      authorization_servers: [this.dataset.authorizationServer],
      credential_endpoint: `${this.dataset.credentialIssuer}/credential`,
      display: [
        {
          name: "Texas Medical Board",
          locale: "en-US",
        },
      ],
      credential_configurations_supported: {
        [DEMO_CONSTANTS.credentialConfigurationId]: {
          format: "jwt_vc_json",
          scope: "board_certification",
          cryptographic_binding_methods_supported: ["did"],
          credential_signing_alg_values_supported: ["EdDSA"],
          proof_types_supported: {
            jwt: {
              proof_signing_alg_values_supported: ["EdDSA"],
            },
          },
          credential_definition: {
            type: ["VerifiableCredential", "BoardCertificationCredential"],
          },
          credential_metadata: {
            display: [
              {
                name: "Board Certification Credential",
                locale: "en-US",
                description:
                  "Attests that the holder is an actively board-certified physician in Texas.",
                background_color: "#d7efe5",
                text_color: "#0b1a14",
              },
            ],
            claims: [
              {
                path: ["credentialSubject", "boardCertification", "state"],
                display: [{ name: "State" }],
              },
              {
                path: ["credentialSubject", "boardCertification", "status"],
                display: [{ name: "Status" }],
              },
              {
                path: ["credentialSubject", "specialty"],
                display: [{ name: "Specialty" }],
              },
            ],
          },
        },
      },
    } as CredentialIssuerMetadata;

    this.credentialOfferObject = {
      credential_issuer: this.dataset.credentialIssuer,
      credential_configuration_ids: [DEMO_CONSTANTS.credentialConfigurationId],
      grants: {
        "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
          "pre-authorized_code": DEMO_CONSTANTS.preAuthorizedCode,
          authorization_server: this.dataset.authorizationServer,
        },
      },
    };

    this.credentialOffer =
      `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(this.dataset.credentialOfferUri)}`;
  }

  private async initialize() {
    this.dataset.statusListEncoded = createEncodedStatusList({
      size: DEMO_CONSTANTS.statusListSize,
      revokedIndices: [],
    });

    this.dataset.statusListCredentialJwt = await createCredentialJwt(
      {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiableCredential", "StatusList2021Credential"],
        id: this.dataset.statusListCredentialUrl,
        issuer: this.actors.issuer.did,
        issuanceDate: DEMO_CONSTANTS.issuedAt,
        expirationDate: DEMO_CONSTANTS.credentialExpiresAt,
        credentialSubject: {
          id: `${this.dataset.statusListCredentialUrl}#list`,
          type: "StatusList2021",
          statusPurpose: "revocation",
          encodedList: this.dataset.statusListEncoded,
        },
      },
      this.actors.issuer,
    );

    this.dataset.boardCertificationCredentialJwt = await createCredentialJwt(
      {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiableCredential", "BoardCertificationCredential"],
        id: `${this.dataset.credentialIssuer}/credentials/board-certification-demo-1`,
        issuer: this.actors.issuer.did,
        issuanceDate: DEMO_CONSTANTS.issuedAt,
        expirationDate: DEMO_CONSTANTS.credentialExpiresAt,
        credentialStatus: createStatusListEntry(
          this.dataset.statusListCredentialUrl,
          DEMO_CONSTANTS.statusListIndex,
        ),
        credentialSubject: {
          id: this.actors.doctor.did,
          name: "Dr. Amelia Stone",
          specialty: "Internal Medicine",
          boardCertification: {
            state: "Texas",
            board: "Texas Medical Board",
            certificationNumber: "TX-BC-2026-0042",
            status: "active",
          },
        },
      },
      this.actors.issuer,
    );

    this.dataset.delegationCredentialJwt = await createCredentialJwt(
      {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiableCredential", "PresentationDelegationCredential"],
        id: `${this.baseUrl}/actors/doctor/credentials/presentation-delegation-demo-1`,
        issuer: this.actors.doctor.did,
        issuanceDate: DEMO_CONSTANTS.issuedAt,
        expirationDate: DEMO_CONSTANTS.delegationExpiresAt,
        credentialSubject: {
          id: this.actors.agent.did,
          delegator: this.actors.doctor.did,
          holder: this.actors.doctor.did,
          allowedCredentialTypes: ["BoardCertificationCredential"],
          scope: {
            route: DEMO_CONSTANTS.paperPath,
            method: "GET",
            audience: this.actors.relyingParty.did,
          },
          purpose:
            "Allow the AI agent to obtain a holder-signed presentation for the protected medical study route.",
        },
      },
      this.actors.doctor,
    );
  }

  getOverview() {
    return {
      baseUrl: this.baseUrl,
      paper: this.paper,
      actors: Object.values(this.actors).map((actor) => ({
        id: actor.id,
        label: actor.label,
        role: actor.role,
        did: actor.did,
        didUrl: actor.didUrl,
        didDocumentUrl: actor.didDocumentUrl,
      })),
      issuer: {
        credentialIssuer: this.dataset.credentialIssuer,
        metadataUrl: `${this.dataset.credentialIssuer}/.well-known/openid-credential-issuer`,
        authorizationServerMetadataUrl: `${this.dataset.authorizationServer}/.well-known/openid-configuration`,
        credentialOfferUri: this.dataset.credentialOfferUri,
        credentialOffer: this.credentialOffer,
        credentialEndpoint: `${this.dataset.credentialIssuer}/credential`,
        tokenEndpoint: `${this.dataset.authorizationServer}/token`,
        statusListCredentialUrl: this.dataset.statusListCredentialUrl,
      },
      artifacts: {
        boardCertificationCredentialJwt: this.dataset.boardCertificationCredentialJwt,
        delegationCredentialJwt: this.dataset.delegationCredentialJwt,
        statusListCredentialJwt: this.dataset.statusListCredentialJwt,
        statusListIndex: DEMO_CONSTANTS.statusListIndex,
        statusActive: true,
      },
    };
  }

  getDidDocumentBySlug(slug: string) {
    const actor = Object.values(this.actors).find((candidate) => candidate.slug === slug);
    return actor ? buildDidDocument(actor) : null;
  }

  getCredentialIssuerMetadata() {
    return this.credentialIssuerMetadata;
  }

  getAuthorizationServerMetadata() {
    return this.authorizationServerMetadata;
  }

  getCredentialOfferObject() {
    return this.credentialOfferObject;
  }

  getCredentialOfferUri() {
    return this.dataset.credentialOfferUri;
  }

  getCredentialOffer() {
    return this.credentialOffer;
  }

  getStatusListCredentialJwt() {
    return this.dataset.statusListCredentialJwt;
  }

  async exchangePreAuthorizedCode(preAuthorizedCode?: string) {
    if (preAuthorizedCode !== DEMO_CONSTANTS.preAuthorizedCode) {
      throw new Error("Invalid pre-authorized code");
    }

    return {
      access_token: DEMO_CONSTANTS.accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      c_nonce: `nonce-${randomUUID()}`,
    };
  }

  async retrieveIssuedCredential(accessToken?: string) {
    if (accessToken !== DEMO_CONSTANTS.accessToken) {
      throw new Error("Invalid access token");
    }

    return {
      format: "jwt_vc_json",
      credential: this.dataset.boardCertificationCredentialJwt,
      c_nonce: `nonce-${randomUUID()}`,
      c_nonce_expires_in: 300,
    };
  }

  async createPaperChallenge() {
    const challengeId = `c-${randomUUID()}`;
    const requestUri = `${this.baseUrl}/verifier/oidc/requests/${challengeId}`;
    const responseUri = `${this.baseUrl}/verifier/oidc/direct-post/${challengeId}`;
    const localWalletUri = `${this.baseUrl}/local-agent/wallet/presentations/${challengeId}`;
    const nonce = `nonce-${randomUUID()}`;
    const state = `state-${randomUUID()}`;
    const authorizationRequestPayload = {
      client_id: this.actors.relyingParty.did,
      client_id_scheme: "did",
      response_type: "vp_token" as const,
      response_mode: "direct_post" as const,
      response_uri: responseUri,
      request_uri: requestUri,
      request_uri_method: "get",
      nonce,
      state,
      client_metadata: {
        client_name: this.actors.relyingParty.label,
        vp_formats: {
          jwt_vc_json: {
            alg_values_supported: ["EdDSA"],
          },
          jwt_vp_json: {
            alg_values_supported: ["EdDSA"],
          },
        },
      },
      dcql_query: {
        credentials: [
          {
            id: "boardCertification",
            format: "jwt_vc_json",
            meta: {
              type_values: ["BoardCertificationCredential"],
            },
            claims: [
              {
                path: ["credentialSubject", "boardCertification", "state"],
                values: ["Texas"],
              },
              {
                path: ["credentialSubject", "boardCertification", "status"],
                values: ["active"],
              },
            ],
          },
        ],
      },
    };
    const requestObjectJwt = await signJsonJwt({
      actor: this.actors.relyingParty,
      header: {
        typ: "oauth-authz-req+jwt",
      },
      payload: {
        ...authorizationRequestPayload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    });

    const envelope = buildMedicalStudyEnvelope({
      challengeId,
      requestUri,
      clientId: this.actors.relyingParty.did,
      relyingPartyDid: this.actors.relyingParty.did,
      issuerDid: this.actors.issuer.did,
      credentialIssuer: this.dataset.credentialIssuer,
      credentialOfferUri: this.dataset.credentialOfferUri,
      localWalletUri,
    });

    const challenge: ChallengeRecord = {
      id: challengeId,
      createdAt: new Date().toISOString(),
      nonce,
      state,
      paperPath: DEMO_CONSTANTS.paperPath,
      wwwAuthenticate: buildP401AuthenticateHeader({
        challengeId,
        requestRef: requestUri,
      }),
      envelope,
      authorizationRequestPayload:
        authorizationRequestPayload as ChallengeRecord["authorizationRequestPayload"],
      requestObjectJwt,
      requestObjectUri: requestUri,
    };

    this.challenges.set(challengeId, challenge);
    return challenge;
  }

  getChallenge(challengeId: string) {
    return this.challenges.get(challengeId) ?? null;
  }

  private requireChallenge(challengeId: string) {
    const challenge = this.getChallenge(challengeId);
    if (!challenge) {
      throw new Error(`Unknown challenge ${challengeId}`);
    }

    return challenge;
  }

  async createLocalPresentation(challengeId: string) {
    const challenge = this.requireChallenge(challengeId);

    const presentationJwt = await createPresentationJwt(
      {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiablePresentation"],
        id: `${this.baseUrl}/presentations/${challengeId}`,
        holder: this.actors.doctor.did,
        verifier: [this.actors.relyingParty.did],
        verifiableCredential: [
          this.dataset.boardCertificationCredentialJwt,
          this.dataset.delegationCredentialJwt,
        ],
      },
      this.actors.doctor,
      {
        challenge: challenge.nonce,
        audience: this.actors.relyingParty.did,
      },
    );

    challenge.localPresentation = {
      presentationJwt,
      authorizationResponsePayload: {
        state: challenge.state,
        vp_token: {
          boardCertification: presentationJwt,
        },
      },
    };

    return {
      challengeId,
      holderDid: this.actors.doctor.did,
      agentDid: this.actors.agent.did,
      delegationCredentialJwt: this.dataset.delegationCredentialJwt,
      boardCertificationCredentialJwt: this.dataset.boardCertificationCredentialJwt,
      presentationJwt,
      authorizationResponsePayload: challenge.localPresentation.authorizationResponsePayload,
      explanation:
        "The presentation is signed by the doctor's DID and includes a separate delegation credential addressed to the AI agent DID.",
    };
  }

  async submitStoredPresentation(challengeId: string) {
    const challenge = this.requireChallenge(challengeId);
    if (!challenge.localPresentation) {
      throw new Error("No locally prepared presentation exists for this challenge");
    }

    return {
      responseMode: "direct_post",
      status: 200,
      body: await this.completeOidcDirectPost(
        challengeId,
        challenge.localPresentation.authorizationResponsePayload as Record<string, unknown>,
      ),
    };
  }

  private async fetchIssuerVerificationContext() {
    const [issuerMetadataResponse, authServerMetadataResponse] = await Promise.all([
      fetch(`${this.dataset.credentialIssuer}/.well-known/openid-credential-issuer`),
      fetch(`${this.dataset.authorizationServer}/.well-known/openid-configuration`),
    ]);

    return {
      issuerMetadata: await issuerMetadataResponse.json(),
      authorizationServerMetadata: await authServerMetadataResponse.json(),
    };
  }

  private async verifyBoardCredentialStatus(statusListCredentialUrl: string, statusListIndex: number) {
    const statusListResponse = await fetch(statusListCredentialUrl);
    const statusListJwt = await statusListResponse.text();
    const verifiedStatusList = await verifyCredentialJwt(
      statusListJwt,
      this.didResolver,
    );
    const encodedList = (verifiedStatusList.verifiableCredential.credentialSubject as {
      encodedList: string;
    }).encodedList;

    return {
      encodedList,
      revoked: isStatusListRevoked(encodedList, statusListIndex),
    };
  }

  private async verifySubmittedPresentation(challenge: ChallengeRecord, authorizationResponsePayload: Record<string, unknown>) {
    const responseState = authorizationResponsePayload.state;
    if (typeof responseState !== "string" || responseState !== challenge.state) {
      throw new Error("The OIDC4VP response state does not match the challenge");
    }

    const rawVpToken = authorizationResponsePayload.vp_token;
    const parsedVpToken =
      typeof rawVpToken === "string" ? JSON.parse(rawVpToken) : rawVpToken;
    const vpEntry =
      parsedVpToken &&
      typeof parsedVpToken === "object" &&
      "boardCertification" in parsedVpToken
        ? (parsedVpToken as Record<string, unknown>).boardCertification
        : parsedVpToken;
    const presentationJwt = Array.isArray(vpEntry) ? vpEntry[0] : vpEntry;

    if (typeof presentationJwt !== "string") {
      throw new Error("Expected a single JWT VP in the dcql response");
    }

    await verifyPresentationJwt(presentationJwt, this.didResolver, {
      audience: this.actors.relyingParty.did,
      challenge: challenge.nonce,
    });

    const decodedPresentation = decodeDidJwt(presentationJwt);
    const embeddedCredentials = (decodedPresentation.payload.vp as {
      verifiableCredential?: unknown[];
    })?.verifiableCredential;

    if (!Array.isArray(embeddedCredentials)) {
      throw new Error("The presentation does not contain verifiable credentials");
    }

    const verifiedCredentials = await Promise.all(
      embeddedCredentials.map(async (credentialJwt) => {
        if (typeof credentialJwt !== "string") {
          throw new Error("Only JWT credentials are supported in this demo");
        }

        return verifyCredentialJwt(credentialJwt, this.didResolver);
      }),
    );

    const boardCredential = verifiedCredentials.find((entry) => {
      const types = entry.verifiableCredential.type;
      return Array.isArray(types) && types.includes("BoardCertificationCredential");
    });

    const delegationCredential = verifiedCredentials.find((entry) => {
      const types = entry.verifiableCredential.type;
      return Array.isArray(types) && types.includes("PresentationDelegationCredential");
    });

    if (!boardCredential || !delegationCredential) {
      throw new Error("Both the board certification and delegation credentials are required");
    }

    const boardCredentialSubject = boardCredential.verifiableCredential.credentialSubject as {
      id: string;
      boardCertification: {
        state: string;
        status: string;
      };
    };
    const boardCredentialStatus = boardCredential.verifiableCredential.credentialStatus as unknown as {
      statusListCredential: string;
      statusListIndex: string;
    };
    const delegationSubject = delegationCredential.verifiableCredential.credentialSubject as {
      id: string;
      holder: string;
      scope: {
        route: string;
        method: string;
        audience: string;
      };
      allowedCredentialTypes: string[];
    };

    if (boardCredentialSubject.id !== this.actors.doctor.did) {
      throw new Error("The board certification credential is not issued to the doctor DID");
    }

    if (
      boardCredentialSubject.boardCertification.state !== "Texas" ||
      boardCredentialSubject.boardCertification.status !== "active"
    ) {
      throw new Error("The board certification credential does not satisfy policy");
    }

    if (
      delegationSubject.id !== this.actors.agent.did ||
      delegationSubject.holder !== this.actors.doctor.did ||
      delegationSubject.scope.route !== DEMO_CONSTANTS.paperPath ||
      delegationSubject.scope.method !== "GET" ||
      delegationSubject.scope.audience !== this.actors.relyingParty.did ||
      !delegationSubject.allowedCredentialTypes.includes("BoardCertificationCredential")
    ) {
      throw new Error("The delegation credential does not authorize this AI agent for this route");
    }

    const issuerContext = await this.fetchIssuerVerificationContext();
    if (
      issuerContext.issuerMetadata.credential_issuer !== this.dataset.credentialIssuer ||
      issuerContext.authorizationServerMetadata.issuer !== this.dataset.authorizationServer
    ) {
      throw new Error("Issuer metadata verification failed");
    }

    const statusCheck = await this.verifyBoardCredentialStatus(
      boardCredentialStatus.statusListCredential,
      Number(boardCredentialStatus.statusListIndex),
    );

    const summary: VerificationSummary = {
      holderDid: this.actors.doctor.did,
      agentDid: this.actors.agent.did,
      issuerDid: this.actors.issuer.did,
      boardCredentialId: String(boardCredential.verifiableCredential.id),
      delegationCredentialId: String(delegationCredential.verifiableCredential.id),
      statusListCredentialUrl: boardCredentialStatus.statusListCredential,
      statusListIndex: Number(boardCredentialStatus.statusListIndex),
      revoked: statusCheck.revoked,
    };

    if (summary.revoked) {
      throw new Error("The board certification credential has been revoked");
    }

    return summary;
  }

  private async issueReceipt(challenge: ChallengeRecord, verification: VerificationSummary) {
    const now = Math.floor(Date.now() / 1000);
    return signJsonJwt({
      actor: this.actors.relyingParty,
      header: {
        typ: "at+jwt",
      },
      payload: {
        iss: this.actors.relyingParty.did,
        sub: verification.holderDid,
        aud: this.actors.relyingParty.did,
        iat: now,
        exp: now + DEMO_CONSTANTS.receiptLifetimeSeconds,
        jti: `receipt-${challenge.id}`,
        challenge_id: challenge.id,
        route: challenge.paperPath,
        method: "GET",
        agent_id: verification.agentDid,
        credential_id: verification.boardCredentialId,
      },
    });
  }

  async completeOidcDirectPost(challengeId: string, formBody: Record<string, unknown>) {
    const challenge = this.requireChallenge(challengeId);
    const verification = await this.verifySubmittedPresentation(challenge, formBody);
    const receiptToken = await this.issueReceipt(challenge, verification);

    challenge.verification = verification;
    challenge.receiptToken = receiptToken;

    return {
      ok: true,
      challengeId,
      receipt_token: receiptToken,
      token_type: "Bearer",
      verification,
      retry: {
        method: "GET",
        route: challenge.paperPath,
        authorization: "Bearer <receipt_token>",
      },
    };
  }

  async verifyReceiptToken(receiptToken: string, route: string, method: string) {
    const verified = await verifyJsonJwt(receiptToken, this.actors.relyingParty);
    const payload = decodeJsonJwtPayload(receiptToken) as {
      route?: string;
      method?: string;
    };

    if (payload.route !== route || payload.method !== method) {
      throw new Error("The verifier receipt is scoped to a different resource");
    }

    return verified;
  }

  getAuthorizedPaperResponse() {
    return {
      ...this.paper,
      accessGranted: true,
      reason: "Active Texas board certification proved through P401 and OIDC4VP.",
    };
  }
}
