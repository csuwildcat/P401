import { decodeJWT, EdDSASigner } from "did-jwt";
import type { Resolvable } from "did-resolver";
import {
  createVerifiableCredentialJwt,
  createVerifiablePresentationJwt,
  verifyCredential,
  verifyPresentation,
  type CredentialPayload,
  type PresentationPayload,
  type VerifyCredentialOptions,
  type VerifyPresentationOptions,
} from "did-jwt-vc";
import type { DemoActor } from "./types.js";
import { base64urlSecretToBytes } from "./crypto.js";

export function actorToIssuer(actor: DemoActor) {
  return {
    did: actor.did,
    signer: EdDSASigner(base64urlSecretToBytes(actor.privateJwk.d)),
    alg: "EdDSA",
  };
}

export async function createCredentialJwt(payload: CredentialPayload, actor: DemoActor) {
  return createVerifiableCredentialJwt(payload, actorToIssuer(actor), {
    header: { kid: actor.didUrl, typ: "JWT" },
  });
}

export async function createPresentationJwt(
  payload: PresentationPayload,
  actor: DemoActor,
  options?: VerifyPresentationOptions,
) {
  return createVerifiablePresentationJwt(payload, actorToIssuer(actor), {
    header: { kid: actor.didUrl, typ: "JWT" },
    challenge: options?.challenge,
    domain: options?.domain,
    aud: options?.audience,
  });
}

export async function verifyCredentialJwt(
  credentialJwt: string,
  resolver: Resolvable,
  options?: VerifyCredentialOptions,
) {
  return verifyCredential(credentialJwt, resolver, options);
}

export async function verifyPresentationJwt(
  presentationJwt: string,
  resolver: Resolvable,
  options?: VerifyPresentationOptions,
) {
  return verifyPresentation(presentationJwt, resolver, options);
}

export function decodeDidJwt(token: string) {
  return decodeJWT(token);
}
