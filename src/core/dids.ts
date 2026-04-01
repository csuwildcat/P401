import type { DIDResolutionResult } from "did-resolver";
import type { DemoActor, DemoDidDocument } from "./types.js";

export function toDidWebHost(baseUrl: string): string {
  const { host } = new URL(baseUrl);
  return host.replaceAll(":", "%3A");
}

export function stripDidFragment(didUrl: string): string {
  return didUrl.split("#")[0] ?? didUrl;
}

export function buildDidForPath(baseUrl: string, ...segments: string[]): string {
  const prefix = `did:web:${toDidWebHost(baseUrl)}`;
  return segments.length === 0 ? prefix : `${prefix}:${segments.join(":")}`;
}

export function buildDidDocumentUrl(baseUrl: string, ...segments: string[]): string {
  const normalized = segments.join("/");
  return `${baseUrl}/${normalized}/did.json`;
}

export function buildDemoActor(input: {
  baseUrl: string;
  id: DemoActor["id"];
  slug: string;
  label: string;
  role: string;
  publicJwk: DemoActor["publicJwk"];
  privateJwk: DemoActor["privateJwk"];
}): DemoActor {
  const did = buildDidForPath(input.baseUrl, "actors", input.slug);
  return {
    ...input,
    did,
    didUrl: `${did}#key-1`,
    didDocumentUrl: buildDidDocumentUrl(input.baseUrl, "actors", input.slug),
  };
}

export function buildDidDocument(actor: DemoActor): DemoDidDocument {
  return {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: actor.did,
    verificationMethod: [
      {
        id: actor.didUrl,
        type: "JsonWebKey2020",
        controller: actor.did,
        publicKeyJwk: actor.publicJwk,
      },
    ],
    authentication: [actor.didUrl],
    assertionMethod: [actor.didUrl],
    capabilityDelegation: [actor.didUrl],
    capabilityInvocation: [actor.didUrl],
  };
}

export function createLocalDidResolver(actors: DemoActor[]) {
  const actorByDid = new Map(actors.map((actor) => [actor.did, actor]));

  return {
    async resolve(didUrl: string) {
      const actor = actorByDid.get(stripDidFragment(didUrl));
      if (!actor) {
        return {
          didDocument: null,
          didDocumentMetadata: {},
          didResolutionMetadata: { error: "notFound" },
        } satisfies DIDResolutionResult;
      }

      return {
        didDocument: buildDidDocument(actor),
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: "application/did+json" },
      } satisfies DIDResolutionResult;
    },
  };
}
