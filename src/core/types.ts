import type { Jwk } from "@openid4vc/oauth2";
import type {
  Openid4vpAuthorizationRequest,
  Openid4vpAuthorizationResponse,
} from "@openid4vc/openid4vp";

export type ActorId = "doctor" | "agent" | "issuer" | "relyingParty";

export interface DemoActor {
  id: ActorId;
  slug: string;
  label: string;
  role: string;
  did: string;
  didUrl: string;
  didDocumentUrl: string;
  publicJwk: Jwk;
  privateJwk: Jwk & { d: string };
}

export interface DemoDidDocument {
  "@context": string[];
  id: string;
  verificationMethod: Array<{
    id: string;
    type: "JsonWebKey2020";
    controller: string;
    publicKeyJwk: Jwk;
  }>;
  authentication: string[];
  assertionMethod: string[];
  capabilityDelegation: string[];
  capabilityInvocation: string[];
}

export interface VerificationSummary {
  holderDid: string;
  agentDid: string;
  issuerDid: string;
  boardCredentialId: string;
  delegationCredentialId: string;
  statusListCredentialUrl: string;
  statusListIndex: number;
  revoked: boolean;
}

export interface ChallengeRecord {
  id: string;
  createdAt: string;
  nonce: string;
  state: string;
  paperPath: string;
  wwwAuthenticate: string;
  envelope: Record<string, unknown>;
  authorizationRequestPayload: Openid4vpAuthorizationRequest;
  requestObjectJwt: string;
  requestObjectUri: string;
  localPresentation?: {
    presentationJwt: string;
    authorizationResponsePayload: Openid4vpAuthorizationResponse;
  };
  receiptToken?: string;
  verification?: VerificationSummary;
}

export interface DemoDataset {
  statusListCredentialJwt: string;
  boardCertificationCredentialJwt: string;
  delegationCredentialJwt: string;
  statusListEncoded: string;
  statusListCredentialUrl: string;
  credentialOfferUri: string;
  credentialIssuer: string;
  authorizationServer: string;
}

