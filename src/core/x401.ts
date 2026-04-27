export function buildx401AuthenticateHeader(options: {
  challengeId: string;
  requestRef: string;
  receiptType?: string;
}) {
  const receiptType = options.receiptType ?? "bearer-token";
  return `x401 challenge_id="${options.challengeId}", request_ref="${options.requestRef}", receipt_type="${receiptType}"`;
}

export function buildMedicalStudyEnvelope(options: {
  challengeId: string;
  requestUri: string;
  clientId: string;
  relyingPartyDid: string;
  issuerDid: string;
  credentialIssuer: string;
  credentialOfferUri: string;
  localWalletUri: string;
}) {
  return {
    scheme: "x401",
    version: "0.1.0",
    challenge_id: options.challengeId,
    scope: {
      policy_id: "board-certified-doctor-access-v1",
      route: "/papers/medical-study-123",
      method: "GET",
      resource_class: "medical_research_paper",
      aud: options.relyingPartyDid,
    },
    proof: {
      request_format: "openid4vp",
      mode: "by_reference",
      client_id: options.clientId,
      request_uri: options.requestUri,
      request_uri_method: "get",
      retry_artifact: "verifier_receipt",
    },
    acquisition: {
      credentials: [
        {
          type: "BoardCertificationCredential",
          notes:
            "The verifier accepts proof of an active state-issued board certification for a licensed physician.",
          issuers: [
            {
              id: options.issuerDid,
              credential_issuer: options.credentialIssuer,
              credential_offer_uri: options.credentialOfferUri,
              authorization_servers: [`${options.credentialIssuer}/oauth`],
              formats: ["jwt_vc_json"],
              credential_configurations_supported: {
                BoardCertificationCredential: {
                  format: "jwt_vc_json",
                },
              },
            },
          ],
        },
      ],
    },
    invoke: {
      preferred_order: ["local-agent-wallet", "direct-post"],
      wallet_links: [
        {
          rel: "present",
          href: options.localWalletUri,
        },
      ],
    },
  };
}
