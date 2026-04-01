import { createHash, randomBytes } from "node:crypto";
import { decodeJwt, importJWK, jwtVerify, SignJWT } from "jose";
import type { CallbackContext, Jwk, JwtSigner } from "@openid4vc/oauth2";
import { clientAuthenticationNone, HashAlgorithm } from "@openid4vc/oauth2";
import type { DemoActor } from "./types.js";
import { stripDidFragment } from "./dids.js";

type ActorIndex = Map<string, DemoActor>;
type ImportedKey = Awaited<ReturnType<typeof importJWK>>;

const privateKeyCache = new Map<string, Promise<ImportedKey>>();
const publicKeyCache = new Map<string, Promise<ImportedKey>>();

function base64urlToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

async function getImportedPrivateKey(actor: DemoActor): Promise<ImportedKey> {
  const cacheKey = `${actor.did}:private`;
  let cached = privateKeyCache.get(cacheKey);
  if (!cached) {
    cached = importJWK(actor.privateJwk, "EdDSA");
    privateKeyCache.set(cacheKey, cached);
  }

  return cached;
}

async function getImportedPublicKey(actor: DemoActor): Promise<ImportedKey> {
  const cacheKey = `${actor.did}:public`;
  let cached = publicKeyCache.get(cacheKey);
  if (!cached) {
    cached = importJWK(actor.publicJwk, "EdDSA");
    publicKeyCache.set(cacheKey, cached);
  }

  return cached;
}

function getActorForSigner(actorIndex: ActorIndex, jwtSigner: JwtSigner): DemoActor {
  if (jwtSigner.method === "did") {
    const actor = actorIndex.get(stripDidFragment(jwtSigner.didUrl));
    if (!actor) {
      throw new Error(`No local actor found for DID signer ${jwtSigner.didUrl}`);
    }

    return actor;
  }

  if (jwtSigner.method === "jwk") {
    const actor = [...actorIndex.values()].find(
      (candidate) => candidate.publicJwk.x === jwtSigner.publicJwk.x,
    );
    if (!actor) {
      throw new Error("No local actor found for JWK signer");
    }

    return actor;
  }

  throw new Error(`Unsupported JWT signer method in demo: ${jwtSigner.method}`);
}

export function createOid4vcCallbacks(actors: DemoActor[]): CallbackContext {
  const actorIndex: ActorIndex = new Map(actors.map((actor) => [actor.did, actor]));

  return {
    fetch,
    hash(data, alg) {
      const hashName =
        alg === HashAlgorithm.Sha512
          ? "sha512"
          : alg === HashAlgorithm.Sha384
            ? "sha384"
            : "sha256";

      return createHash(hashName).update(data).digest();
    },
    async signJwt(jwtSigner, jwt) {
      const actor = getActorForSigner(actorIndex, jwtSigner);
      const privateKey = await getImportedPrivateKey(actor);
      const signed = await new SignJWT(jwt.payload)
        .setProtectedHeader(jwt.header)
        .sign(privateKey);

      return {
        jwt: signed,
        signerJwk: actor.publicJwk,
      };
    },
    async verifyJwt(jwtSigner, jwt) {
      try {
        const actor = getActorForSigner(actorIndex, jwtSigner);
        const publicKey = await getImportedPublicKey(actor);

        await jwtVerify(jwt.compact, publicKey, {
          algorithms: [jwt.header.alg],
        });

        return {
          verified: true as const,
          signerJwk: actor.publicJwk,
        };
      } catch {
        return {
          verified: false as const,
        };
      }
    },
    async encryptJwe() {
      throw new Error("JWE is not enabled in this demo");
    },
    async decryptJwe() {
      throw new Error("JWE is not enabled in this demo");
    },
    generateRandom(byteLength) {
      return randomBytes(byteLength);
    },
    clientAuthentication: clientAuthenticationNone({
      clientId: "demo-wallet",
    }),
  };
}

export async function signJsonJwt(options: {
  actor: DemoActor;
  payload: Record<string, unknown>;
  header?: Record<string, unknown>;
}): Promise<string> {
  const privateKey = await getImportedPrivateKey(options.actor);
  return new SignJWT(options.payload)
    .setProtectedHeader({
      alg: "EdDSA",
      typ: "JWT",
      kid: options.actor.didUrl,
      ...options.header,
    })
    .sign(privateKey);
}

export async function verifyJsonJwt(token: string, actor: DemoActor) {
  const publicKey = await getImportedPublicKey(actor);
  return jwtVerify(token, publicKey, {
    algorithms: ["EdDSA"],
  });
}

export function decodeJsonJwtPayload(token: string): Record<string, unknown> {
  return decodeJwt(token);
}

export function bufferToBase64url(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString("base64url");
}

export function jwkThumbprintKey(value: Jwk): string {
  return `${value.kty}:${value.crv ?? ""}:${value.x ?? value.n ?? ""}`;
}

export function base64urlSecretToBytes(secret: string): Uint8Array {
  return new Uint8Array(base64urlToBuffer(secret));
}
