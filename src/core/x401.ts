export function buildx401AuthenticateHeader(options: {
  challengeId: string;
  requestRef: string;
  retryArtifact?: string;
}) {
  const retryArtifact = options.retryArtifact ?? "verification_token";
  return `x401 challenge_id="${options.challengeId}", request_ref="${options.requestRef}", retry_artifact="${retryArtifact}"`;
}

export function buildMedicalStudyEnvelope(options: {
  challengeId: string;
  requestUri: string;
  clientId: string;
  issuerDid: string;
  credentialIssuer: string;
  credentialOfferUri: string;
}) {
  return {
    scheme: "x401",
    version: "0.1.0",
    challenge_id: options.challengeId,
    proof: {
      request_format: "openid4vp",
      mode: "by_reference",
      client_id: options.clientId,
      request_uri: options.requestUri,
      request_uri_method: "get",
      retry_artifact: "verification_token",
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
  };
}
