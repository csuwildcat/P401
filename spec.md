P401: HTTP Proof Challenge Protocol
==================

Status: Draft

Version: 0.0.1

Editors:
~ Daniel Buchner

Participate:
~ [GitHub repo](https://github.com/csuwildcat/P401)
~ [File an issue](https://github.com/csuwildcat/P401/issues)
~ [Commit history](https://github.com/csuwildcat/P401/commits/main)

------------------------------------

## Abstract

P401 defines an HTTP-based, route-scoped proof challenge protocol for requiring credential-based proof before access to a protected resource is granted.

P401 uses:

- **HTTP 401 Unauthorized** to signal that proof is required
- **OpenID for Verifiable Presentations (OIDC4VP)** as the proof request and presentation mechanism
- **OpenID for Verifiable Credential Issuance (OIDC4VCI)** for optional, non-authoritative issuance hints that help callers discover where qualifying credentials may be obtained

P401 is intentionally separate from payment protocols. When payment is required, it MUST be handled with **HTTP 402 Payment Required** and an appropriate payment protocol. P401 MUST NOT redefine payment semantics.

This document defines the P401 envelope, processing rules, interoperability requirements, and examples for proof-only and proof-plus-payment flows.

::: note Protocol Boundary
P401 defines proof challenge semantics only. When payment is required, implementations still use `402 Payment Required` and a separate payment protocol.
:::

## Status of This Document

This is a draft specification. It is provided in a style intended to be similar to DIF single-file specifications.

## Introduction

HTTP provides a standard challenge mechanism for authentication via `401 Unauthorized` and `WWW-Authenticate`, but it does not define a general-purpose, machine-readable protocol for route-scoped proof requirements such as:

- proving personhood
- proving country of residency
- proving membership or accreditation
- proving entitlement issued by a specific issuer class
- proving organizational standing
- proving a delegated or workload identity attribute

At the same time, the OpenID4VP and OIDC4VCI specifications define interoperable mechanisms for requesting presentations and issuing credentials, but they are not themselves an HTTP route challenge protocol.

P401 fills that gap by defining an HTTP-native wrapper that:

- signals proof requirements at the protected route
- carries or references an OIDC4VP proof request
- optionally includes OIDC4VCI-based issuance hints
- supports interactive and agentic clients
- composes with, but does not subsume, payment protocols

In the typical flow, a [[ref: Holder]] receives a challenge from a [[ref: Verifier]] and uses a [[ref: Wallet]] to satisfy the embedded or referenced [[ref: Proof Request]]. Any [[ref: Issuance Hint]] data is advisory only.

## Design Goals

The goals of P401 are:

1. Define a route-scoped proof challenge for HTTP resources.
2. Reuse existing proof and issuance standards where possible.
3. Support both human-facing and agentic flows.
4. Remain separate from payment semantics.
5. Allow issuance discovery hints without making them authoritative verification rules.
6. Allow proof requirements to be returned either by value or by reference.

## Non-Goals

P401 does not:

- define a new credential format
- replace OIDC4VP
- replace OIDC4VCI
- define a wallet invocation protocol
- define a payment protocol
- require all verifiers to maintain server-side session state

## Terminology

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in RFC 2119 and RFC 8174.

[[def: Verifier]]:
~ The party protecting a resource or operation and requiring proof.

[[def: Holder]]:
~ The subject or caller that possesses credentials and can present proof.

[[def: Wallet]]:
~ Software capable of fulfilling an OIDC4VP presentation request.

[[def: Proof Request]]:
~ An OpenID4VP Authorization Request, conveyed by value or by reference, that describes the credentials, claims, predicates, or constraints that must be satisfied.

[[def: Issuance Hint]]:
~ A non-authoritative hint describing where the caller may be able to obtain credentials through OIDC4VCI or a compatible issuance mechanism.

[[def: P401 Envelope]]:
~ The JSON object defined by this specification and returned in the response body of a `401 Unauthorized` response.

## Protocol Overview

### Proof-Only Flow

1. Client requests a protected route.
2. The [[ref: Verifier]] determines that proof is required.
3. The [[ref: Verifier]] returns `401 Unauthorized` with:
   - `WWW-Authenticate: P401 ...`
   - a [[ref: P401 Envelope]] in the response body
4. The client fulfills the proof requirement using the embedded or referenced OIDC4VP [[ref: Proof Request]].
5. The client retries the protected route with the resulting proof artifact or verifier-issued receipt.
6. The [[ref: Verifier]] validates the proof and returns the protected resource if successful.

```mermaid
sequenceDiagram
    participant Client
    participant Verifier
    participant Wallet
    Client->>Verifier: Request protected route
    Verifier-->>Client: 401 + WWW-Authenticate: P401 + envelope
    Client->>Wallet: Fulfill OIDC4VP request
    Wallet-->>Client: Presentation or receipt
    Client->>Verifier: Retry with proof artifact
    Verifier-->>Client: Protected resource
```

## OIDC Boundary and Reuse

P401 stays intentionally narrow. It defines the HTTP challenge at the protected route and the envelope that carries proof and acquisition data. It does not redefine the OIDC objects carried inside that envelope.

The protocol boundary is:

1. P401 governs the protected-route exchange up to `401 Unauthorized`, `WWW-Authenticate: P401`, and the P401 envelope.
2. OIDC4VP takes over as soon as the client processes `proof.request` or dereferences `proof.request_uri`.
   - In `by_value` mode, `proof.request` is a JSON representation of the OIDC4VP Authorization Request parameters and MUST preserve the original OIDC parameter names exactly. See OpenID4VP Section 5 and Section 8: <https://openid.net/specs/openid-4-verifiable-presentations-1_0-final.html>.
   - In `by_reference` mode, `proof.request_uri` is the OIDC4VP `request_uri` transport, and the dereferenced resource MUST satisfy OpenID4VP Section 5.7, Section 5.10.1, and RFC 9101: <https://openid.net/specs/openid-4-verifiable-presentations-1_0-final.html>, <https://datatracker.ietf.org/doc/html/rfc9101>.
3. Wallet-to-verifier proof submission then follows standard OIDC4VP response handling.
   - `vp_token` response semantics: OpenID4VP Section 8.1.
   - `direct_post` and `response_uri`: OpenID4VP Section 8.2.
   - Verifier validation of `client_id` and `nonce` binding: OpenID4VP Section 8.6 and Section 14.1.2.
4. P401 resumes only after the verifier has accepted the OIDC4VP result and the caller retries the original protected route with the expected retry artifact.
5. `acquisition` never changes verification behavior. When it points to issuance, it points to standard OIDC4VCI objects such as a Credential Issuer Identifier, Credential Issuer Metadata, or a Credential Offer. See OpenID4VCI Section 4.1.3 and Section 12.2: <https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0-final.html>.

### Proof-Plus-Payment Flow

1. Client requests a protected route.
2. The [[ref: Verifier]] determines that proof is required.
3. The [[ref: Verifier]] returns `401 Unauthorized` with a [[ref: P401 Envelope]] that may also declare that payment is required separately.
4. The client fulfills the proof requirement.
5. The [[ref: Verifier]], or the protected route, determines that proof is satisfied but payment remains unsatisfied.
6. The [[ref: Verifier]] returns `402 Payment Required` with payment protocol details.
7. The client satisfies payment.
8. The client retries the route.
9. The [[ref: Verifier]] returns the protected resource if both proof and payment are satisfied.

```mermaid
sequenceDiagram
    participant Client
    participant Verifier
    participant Wallet
    participant Payment
    Client->>Verifier: Request protected route
    Verifier-->>Client: 401 + P401 envelope
    Client->>Wallet: Fulfill OIDC4VP request
    Wallet-->>Client: Presentation or receipt
    Client->>Verifier: Retry or complete proof flow
    Verifier-->>Client: 402 Payment Required
    Client->>Payment: Complete payment protocol
    Payment-->>Client: Payment artifact
    Client->>Verifier: Retry with proof + payment
    Verifier-->>Client: Protected resource
```

## HTTP Semantics

Status Code | Meaning in a P401-capable deployment | Client expectation
----------- | ------------------------------------ | ------------------
`401 Unauthorized` | Proof is required or not yet satisfied | Inspect `WWW-Authenticate: P401` and parse the envelope
`402 Payment Required` | Payment remains unsatisfied | Switch to the payment protocol
`403 Forbidden` | Proof was presented but policy satisfaction failed | Do not treat this as another challenge

### 401 for Proof

A server that requires proof for access to a protected resource MUST return `401 Unauthorized`.

The response MUST include a `WWW-Authenticate` challenge using the `P401` scheme.

Example:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: P401 challenge_id="c-123"
Content-Type: application/json
Cache-Control: no-store
```

The response body MUST contain a P401 envelope.

### 402 for Payment

A server that requires payment MUST use `402 Payment Required` and MUST NOT overload P401 to represent payment as proof.

Payment metadata MAY be declared in a P401 envelope for informational purposes when both proof and payment are required, but payment satisfaction itself remains governed by the payment protocol used with `402`.

### 403 for Failed Policy Satisfaction

If a client presents a proof artifact that is structurally valid but does not satisfy the verifier's policy, the verifier SHOULD return `403 Forbidden`.

Examples include:

- credential from an untrusted issuer
- credential does not satisfy predicates
- expired or revoked credential
- insufficient assurance level

## P401 Challenge Scheme

The `WWW-Authenticate` header identifies the presence of a P401 challenge.

### Header Syntax

A P401 challenge uses the following general form:

```http
WWW-Authenticate: P401 challenge_id="c-123", request_ref="https://api.example.com/p401/requests/c-123"
```

### Header Parameters

Name | Definition
---- | ----------
`challenge_id` | A verifier-generated identifier for the challenge instance. It MUST be unique within the verifier's operational scope for the lifetime of the challenge, MAY be omitted if the verifier uses only by-value requests and does not require challenge correlation, and SHOULD be included when the verifier uses by-reference requests, OIDC4VP response endpoints, or proof-plus-payment orchestration.
`request_ref` | An OPTIONAL URL reference for retrieving a proof request or related metadata. When the `proof` object uses `mode: "by_reference"`, `request_ref` SHOULD match `proof.request_uri`.
`scope_ref` | An OPTIONAL reference to a route or policy scope description.
`receipt_type` | An OPTIONAL hint describing the type of artifact the verifier expects on retry, for example `presentation`, `bearer-token`, or `proof-receipt`.

## P401 Envelope

A P401 response body MUST contain a single JSON object with the following top-level members.

### Top-Level Members

```json
{
  "scheme": "P401",
  "version": "0.1.0",
  "challenge_id": "c-123",
  "scope": {},
  "proof": {},
  "acquisition": {},
  "payment": {},
  "invoke": {}
}
```

### Member Definitions

Name | Definition
---- | ----------
`scheme` | REQUIRED. Value MUST be the string `"P401"`.
`version` | REQUIRED. The P401 envelope version.
`challenge_id` | OPTIONAL, but RECOMMENDED. If present, MUST match the `challenge_id` in the `WWW-Authenticate` header when that parameter is present.
`scope` | REQUIRED. Describes the route or policy context for which proof is required.
`proof` | REQUIRED. Contains an OIDC4VP request by value or by reference.
`acquisition` | OPTIONAL. Contains issuance hints, including OIDC4VCI discovery pointers.
`payment` | OPTIONAL. Describes that payment is additionally required, without replacing `402` semantics.
`invoke` | OPTIONAL. Contains non-normative hints for wallet invocation or proof acquisition UX.

## Scope Object

The scope object describes what protected route or policy the proof requirement applies to.

### Example

```json
{
  "policy_id": "premium-dataset-access-v3",
  "route": "/datasets/:datasetId",
  "method": "GET",
  "resource_class": "premium_dataset",
  "aud": "did:web:api.example.com"
}
```

### Scope Members

Name | Definition
---- | ----------
`policy_id` | OPTIONAL, but RECOMMENDED. A stable identifier for the verifier policy.
`route` | REQUIRED. The route or canonical route template.
`method` | REQUIRED. The HTTP method to which the challenge applies.
`resource_class` | OPTIONAL. A verifier-defined class describing the type of protected resource.
`aud` | REQUIRED. The intended verifier or resource audience identifier for the protected route. This member is P401-specific context. It is not the OIDC4VP Request Object `aud` claim. If an OIDC4VP Request Object is used, its `aud` claim MUST follow OpenID4VP Section 5.8 rather than copying `scope.aud` verbatim: <https://openid.net/specs/openid-4-verifiable-presentations-1_0-final.html>.

## Proof Object

The proof object carries or references the OIDC4VP request.

### General Structure

```json
{
  "request_format": "openid4vp",
  "mode": "by_value",
  "request": {},
  "retry_artifact": "verifier_receipt"
}
```

or

```json
{
  "request_format": "openid4vp",
  "mode": "by_reference",
  "client_id": "x509_san_dns:api.example.com",
  "request_uri": "https://api.example.com/p401/requests/c-123",
  "request_uri_method": "get",
  "retry_artifact": "verifier_receipt"
}
```

### Members

Name | Definition
---- | ----------
`request_format` | REQUIRED. Value MUST be `"openid4vp"` for this version of the specification.
`mode` | REQUIRED. MUST be either `by_value` or `by_reference`.
`request` | REQUIRED when `mode` is `by_value`. Contains a complete OIDC4VP Authorization Request expressed as JSON members using the exact OIDC parameter names. Examples of members that remain inside `request` are `client_id`, `response_type`, `response_mode`, `response_uri`, `redirect_uri`, `nonce`, `state`, `dcql_query`, `scope`, and `client_metadata`. P401 MUST NOT rename or reinterpret those OIDC4VP members. See OpenID4VP Section 5 and Section 8: <https://openid.net/specs/openid-4-verifiable-presentations-1_0-final.html>.
`client_id` | REQUIRED when `mode` is `by_reference`. Contains the OIDC4VP `client_id` Authorization Request parameter that accompanies `request_uri`. See OpenID4VP Section 5.7 and Section 5.9: <https://openid.net/specs/openid-4-verifiable-presentations-1_0-final.html>.
`request_uri` | REQUIRED when `mode` is `by_reference`. Contains the OIDC4VP `request_uri` value from which the Wallet obtains the Request Object. If dereferenced over HTTP, the returned object MUST satisfy OpenID4VP Section 5.10.1 and RFC 9101: <https://openid.net/specs/openid-4-verifiable-presentations-1_0-final.html>, <https://datatracker.ietf.org/doc/html/rfc9101>.
`request_uri_method` | OPTIONAL. Contains the OIDC4VP `request_uri_method` parameter when the verifier expects POST-based Request URI retrieval. If omitted, Wallets use the default `request_uri` processing defined by RFC 9101 and OpenID4VP.
`retry_artifact` | OPTIONAL. Describes what the caller should present when retrying the original protected route. Example values are `raw_presentation`, `verifier_receipt`, and `bearer_token`.

## OIDC4VP Reuse Rules

P401 implementations that use OIDC4VP:

1. MUST use an OIDC4VP Authorization Request that is valid under OpenID4VP.
2. MUST preserve the exact OIDC4VP parameter names inside the carried request and MUST NOT define P401 aliases for `response_uri`, `redirect_uri`, `response_mode`, `nonce`, `state`, `dcql_query`, `scope`, or `client_metadata`.
3. MUST include an OIDC4VP `client_id`.
4. MUST include a valid OIDC4VP `response_type` for the chosen flow.
5. MUST include either `dcql_query` or `scope` representing a DCQL query, but not both.
6. MUST use `response_uri` when `response_mode` is `direct_post`, and MUST NOT replace it with a P401-specific field.
7. If `request_uri` is used, the dereferenced Request Object MUST be returned as `application/oauth-authz-req+jwt` and satisfy RFC 9101 processing.
8. SHOULD include a fresh nonce in each request instance.
9. SHOULD use short expiry windows when a signed Request Object is used.
10. If a Request Object is used, its `aud` claim MUST follow OpenID4VP Section 5.8 rather than copying `scope.aud`.
11. SHOULD prefer a verifier-issued receipt or token for subsequent route retry when doing multi-step or browser-centric flows.

### By-Value Proof Example

::: example By-Value Proof Example
```json
{
  "request_format": "openid4vp",
  "mode": "by_value",
  "request": {
    "client_id": "x509_san_dns:api.example.com",
    "response_type": "vp_token",
    "response_mode": "direct_post",
    "response_uri": "https://api.example.com/p401/complete/c-123",
    "nonce": "n-7f98d5",
    "state": "c-123",
    "dcql_query": {
      "credentials": [
        {
          "id": "over18",
          "format": "dc+sd-jwt",
          "claims": [
            {
              "path": ["age_over_18"],
              "equals": true
            }
          ]
        }
      ]
    }
  },
  "retry_artifact": "verifier_receipt"
}
```
:::

### By-Reference Proof Example

::: example By-Reference Proof Example
```json
{
  "request_format": "openid4vp",
  "mode": "by_reference",
  "client_id": "x509_san_dns:api.example.com",
  "request_uri": "https://api.example.com/p401/requests/c-123",
  "request_uri_method": "get",
  "retry_artifact": "verifier_receipt"
}
```
:::

## Acquisition Object

The acquisition object provides non-authoritative issuance hints to help the caller obtain credentials that could satisfy the proof requirement.

The acquisition object MUST NOT redefine or weaken verifier policy. It is informational only.

::: warning Non-Authoritative Hints
`acquisition` helps a caller discover candidate credentials and issuers. It does not define the [[ref: Verifier]]'s trusted issuer set, and it does not relax proof validation rules.
:::

### General Structure

```json
{
  "credentials": [
    {
      "type": "Over18Credential",
      "issuers": [
        {
          "id": "did:web:issuer.example",
          "credential_issuer": "https://issuer.example",
          "credential_offer_uri": "https://issuer.example/credential-offers/over18",
          "formats": ["dc+sd-jwt"]
        }
      ]
    }
  ]
}
```

### Acquisition Members

Name | Definition
---- | ----------
`credentials` | OPTIONAL. An array of credential acquisition hint objects.

### Credential Acquisition Hint Members

Name | Definition
---- | ----------
`type` | REQUIRED. A human-readable or ecosystem-specific credential type hint.
`issuers` | OPTIONAL. An array of issuer hint objects.
`marketplaces` | OPTIONAL. An array of marketplace or broker endpoints that may assist in obtaining credentials.
`notes` | OPTIONAL. Human-readable notes about issuance.

### Issuer Hint Members

Name | Definition
---- | ----------
`id` | OPTIONAL, but RECOMMENDED. A DID or other issuer identifier.
`credential_issuer` | OPTIONAL. An OIDC4VCI Credential Issuer Identifier. This is not the well-known metadata URL itself. Wallets derive the metadata location from this identifier using OpenID4VCI Section 12.2.2. See OpenID4VCI Section 12.2.1, Section 12.2.2, and Section 12.2.4: <https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0-final.html>.
`credential_offer_uri` | OPTIONAL. A reference to an OIDC4VCI Credential Offer Object. See OpenID4VCI Section 4.1.3: <https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0-final.html>.
`authorization_servers` | OPTIONAL. An array of associated OAuth 2.0 Authorization Server identifiers, using the same meaning as the OIDC4VCI `authorization_servers` metadata member. See OpenID4VCI Section 12.2.4 and RFC 8414: <https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0-final.html>, <https://datatracker.ietf.org/doc/html/rfc8414>.
`formats` | OPTIONAL. An array of credential formats the issuer is believed to support.
`credential_configurations_supported` | OPTIONAL. A subset or hint of `credential_configurations_supported`, using the same structure as OIDC4VCI metadata.

### OIDC4VCI Reuse Rules

P401 acquisition hints that reference OIDC4VCI:

1. If `credential_issuer` is present, it MUST be the Credential Issuer Identifier, not the `/.well-known/openid-credential-issuer` URL.
2. Wallets resolve metadata from `credential_issuer` using OpenID4VCI Section 12.2.2.
3. `authorization_servers` and `credential_configurations_supported`, when present, MUST retain the same semantics they have in OIDC4VCI metadata.
4. `credential_offer_uri`, when present, MUST reference a Credential Offer Object as defined by OpenID4VCI Section 4.1.3.
5. Hints MUST be treated by the client as hints only.
6. Hints MUST NOT be used as the sole source of trust for proof validation.
7. Hints MUST NOT be interpreted as the verifier's exclusive trusted issuer set unless separately declared in verifier policy.

### OIDC4VCI Acquisition Example

```json
{
  "credentials": [
    {
      "type": "AccreditedInvestorCredential",
      "issuers": [
        {
          "id": "did:web:accredited.example",
          "credential_issuer": "https://accredited.example",
          "credential_offer_uri": "https://accredited.example/credential-offers/accredited-investor",
          "authorization_servers": [
            "https://accredited.example/oauth"
          ],
          "formats": [
            "dc+sd-jwt"
          ],
          "credential_configurations_supported": {
            "AccreditedInvestorCredential": {
              "format": "dc+sd-jwt"
            }
          }
        }
      ]
    }
  ]
}
```

## Payment Object

When both proof and payment are required, a P401 envelope MAY declare the existence of an additional payment requirement.

The payment object is informational and orchestration-oriented only. It does not replace `402 Payment Required`.

### Example

```json
{
  "required": true,
  "separate_http_status": 402,
  "scheme_hint": "x402",
  "notes": "Payment is required after proof is satisfied."
}
```

### Members

Name | Definition
---- | ----------
`required` | OPTIONAL. Boolean indicating whether payment is additionally required.
`separate_http_status` | OPTIONAL. If present, MUST be `402`.
`scheme_hint` | OPTIONAL. A hint naming the expected payment protocol.
`notes` | OPTIONAL. Human-readable notes.

## Invoke Object

The invoke object contains optional wallet invocation hints. It is non-normative.

### Example

```json
{
  "preferred_order": [
    "digital-credentials-api",
    "https-link",
    "web-wallet"
  ],
  "wallet_links": [
    {
      "rel": "present",
      "href": "https://wallet.example/present?request_uri=https%3A%2F%2Fapi.example.com%2Fp401%2Frequests%2Fc-123"
    }
  ]
}
```

## Client Processing Rules

A client receiving a `401 Unauthorized` response with a `WWW-Authenticate: P401 ...` challenge:

1. MUST treat the response as a proof requirement.
2. MUST parse the P401 envelope if the content type is JSON.
3. SHOULD inspect `scope` to determine applicability.
4. MUST process the `proof` object to determine how to fulfill the requirement.
5. MAY use `acquisition` hints to attempt credential discovery or issuance.
6. MUST NOT treat acquisition hints as trusted issuer policy by themselves.
7. MUST hand off OIDC members to standard OpenID4VP processing without renaming or reinterpretation.
8. MAY invoke a wallet or agent subsystem to fulfill the OIDC4VP request.
9. If `credential_offer_uri` is used, MUST follow the OIDC4VCI Credential Offer flow rather than a P401-defined issuance flow.
10. MAY retry the original route with:
   - a raw presentation, if the verifier expects that model, or
   - a verifier-issued receipt or bearer token, if the verifier uses an OIDC4VP response endpoint model

## Verifier Processing Rules

A verifier implementing P401:

1. MUST return `401 Unauthorized` when proof is required and unsatisfied.
2. MUST include `WWW-Authenticate: P401 ...`.
3. MUST include a valid P401 envelope in the response body.
4. MUST ensure the embedded or referenced OIDC4VP request is valid.
5. MUST NOT define P401-specific aliases for OIDC4VP request or response members.
6. SHOULD include fresh nonce values in each request instance.
7. SHOULD use short-lived expiries when signed Request Objects are used.
8. MUST validate proofs according to the OIDC4VP and credential format rules it relies upon, including the required `client_id` and `nonce` binding checks.
9. MUST evaluate issuer trust, status, revocation, and policy constraints independently of acquisition hints.
10. SHOULD return `403 Forbidden` if proof is presented but policy satisfaction fails.
11. MUST use `402 Payment Required` separately if payment is required and remains unsatisfied.

## Retry Models

P401 supports two broad retry models.

Model | Retry artifact | Best fit
----- | -------------- | --------
Raw presentation retry | A presentation or proof artifact is sent back to the protected route | Direct API-to-API flows
Verifier receipt retry | A verifier-issued receipt or bearer token is sent on retry | Browser-centric, delegated, and multi-step flows

### Model A: Raw Presentation Retry

The client fulfills the OIDC4VP request and retries the original route with the resulting proof material.

Example:

```http
GET /restricted/resource HTTP/1.1
Host: api.example.com
Authorization: P401 proof="eyJhbGciOi..."
```

### Model B: Verifier Receipt Retry

The client fulfills the OIDC4VP request through the OIDC4VP response endpoint, for example the `response_uri` used with `direct_post`, and the verifier issues a receipt or token that the client uses when retrying the original route.

Example:

```http
GET /restricted/resource HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOi...
```

Model B is RECOMMENDED for browser-centric and multi-step flows.

## Examples

## Example 1: Proof-Only, By Value

### Initial Request

```http
GET /reports/quarterly HTTP/1.1
Host: api.example.com
```

### Response

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: P401 challenge_id="proof-001", receipt_type="verifier_receipt"
Content-Type: application/json
Cache-Control: no-store
```

```json
{
  "scheme": "P401",
  "version": "0.1.0",
  "challenge_id": "proof-001",
  "scope": {
    "policy_id": "active-member-report-access-v1",
    "route": "/reports/quarterly",
    "method": "GET",
    "resource_class": "member_report",
    "aud": "did:web:api.example.com"
  },
  "proof": {
    "request_format": "openid4vp",
    "mode": "by_value",
    "request": {
      "client_id": "x509_san_dns:api.example.com",
      "response_type": "vp_token",
      "response_mode": "direct_post",
      "response_uri": "https://api.example.com/p401/complete/proof-001",
      "nonce": "n-c8f5f6",
      "state": "proof-001",
      "dcql_query": {
        "credentials": [
          {
            "id": "membership",
            "format": "dc+sd-jwt",
            "claims": [
              {
                "path": ["membership_active"],
                "equals": true
              }
            ]
          }
        ]
      }
    },
    "retry_artifact": "verifier_receipt"
  },
  "acquisition": {
    "credentials": [
      {
        "type": "MembershipCredential",
        "issuers": [
          {
            "id": "did:web:issuer.example",
            "credential_issuer": "https://issuer.example",
            "credential_offer_uri": "https://issuer.example/credential-offers/membership",
            "authorization_servers": [
              "https://issuer.example/oauth"
            ],
            "formats": [
              "dc+sd-jwt"
            ]
          }
        ]
      }
    ]
  }
}
```

### Successful Retry

```http
GET /reports/quarterly HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOi...
```

## Example 2: Proof-Only, By Reference

### Initial Request

```http
GET /adult-content/video/123 HTTP/1.1
Host: media.example.com
```

### Response

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: P401 challenge_id="proof-002", request_ref="https://media.example.com/p401/requests/proof-002"
Content-Type: application/json
Cache-Control: no-store
```

```json
{
  "scheme": "P401",
  "version": "0.1.0",
  "challenge_id": "proof-002",
  "scope": {
    "policy_id": "age-gate-v1",
    "route": "/adult-content/video/:id",
    "method": "GET",
    "resource_class": "age_restricted_media",
    "aud": "did:web:media.example.com"
  },
  "proof": {
    "request_format": "openid4vp",
    "mode": "by_reference",
    "client_id": "x509_san_dns:media.example.com",
    "request_uri": "https://media.example.com/p401/requests/proof-002",
    "request_uri_method": "get",
    "retry_artifact": "verifier_receipt"
  },
  "acquisition": {
    "credentials": [
      {
        "type": "Over18Credential",
        "issuers": [
          {
            "id": "did:web:age-issuer.example",
            "credential_issuer": "https://age-issuer.example",
            "credential_offer_uri": "https://age-issuer.example/credential-offers/over18",
            "formats": [
              "dc+sd-jwt"
            ]
          }
        ]
      }
    ]
  },
  "invoke": {
    "preferred_order": [
      "digital-credentials-api",
      "https-link",
      "web-wallet"
    ],
    "wallet_links": [
      {
        "rel": "present",
        "href": "https://wallet.example/present?request_uri=https%3A%2F%2Fmedia.example.com%2Fp401%2Frequests%2Fproof-002"
      }
    ]
  }
}
```

## Example 3: Proof Plus Payment

### Initial Request

```http
GET /datasets/premium/42 HTTP/1.1
Host: api.example.com
```

### Initial Response: Proof Required

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: P401 challenge_id="proofpay-001"
Content-Type: application/json
Cache-Control: no-store
```

```json
{
  "scheme": "P401",
  "version": "0.1.0",
  "challenge_id": "proofpay-001",
  "scope": {
    "policy_id": "premium-dataset-accredited-v2",
    "route": "/datasets/premium/:id",
    "method": "GET",
    "resource_class": "premium_dataset",
    "aud": "did:web:api.example.com"
  },
  "proof": {
    "request_format": "openid4vp",
    "mode": "by_reference",
    "client_id": "x509_san_dns:api.example.com",
    "request_uri": "https://api.example.com/p401/requests/proofpay-001",
    "request_uri_method": "get",
    "retry_artifact": "verifier_receipt"
  },
  "acquisition": {
    "credentials": [
      {
        "type": "AccreditedInvestorCredential",
        "issuers": [
          {
            "id": "did:web:accredited.example",
            "credential_issuer": "https://accredited.example",
            "credential_offer_uri": "https://accredited.example/credential-offers/accredited-investor",
            "authorization_servers": [
              "https://accredited.example/oauth"
            ],
            "formats": [
              "dc+sd-jwt"
            ]
          }
        ]
      }
    ]
  },
  "payment": {
    "required": true,
    "separate_http_status": 402,
    "scheme_hint": "x402",
    "notes": "Payment is required after proof is satisfied."
  }
}
```

### Subsequent Response: Payment Required

After the verifier determines proof is satisfied but payment is still missing:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
Cache-Control: no-store
```

```json
{
  "payment": {
    "scheme": "x402",
    "amount": "0.25",
    "currency": "USD",
    "description": "Premium dataset access"
  }
}
```

### Final Retry

```http
GET /datasets/premium/42 HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOi...
Payment-Signature: eyJwYXltZW50Ijoic2lnbmVkIn0
```

## Security Considerations

### Replay Prevention

OIDC4VP requests used within P401 SHOULD include fresh nonce values and short expiries. Verifiers SHOULD reject stale or replayed proofs.

### Audience Binding

Returned presentations MUST be bound to the OIDC4VP `client_id` and `nonce` values used in the Authorization Request, as required by OpenID4VP Section 14.1.2.

If a Request Object is used, its `aud` claim MUST follow OpenID4VP Section 5.8. `scope.aud` remains descriptive P401 context and does not override the OIDC4VP Request Object rules.

### Issuer Trust

Acquisition hints MUST NOT be treated as sufficient trust material. Verifiers MUST apply their own trusted issuer policy and validation logic.

### Proof Submission

Verifiers SHOULD prefer verifier-issued receipts or tokens for route retry in multi-step flows to avoid repeatedly transmitting large raw presentations.

### Payment Separation

Implementations MUST keep proof and payment semantics separate. A proof artifact MUST NOT be treated as payment, and payment satisfaction MUST NOT be treated as proof satisfaction.

## Privacy Considerations

### Data Minimization

Verifiers SHOULD request the minimum attributes or predicates necessary for access control.

### Selective Disclosure

Implementations SHOULD prefer credential formats and proof methods that support selective disclosure or predicate proofs where available.

### Correlation Risk

Repeated use of the same credential or issuer across multiple routes may introduce correlation risk. Implementers SHOULD consider verifier-specific or minimally identifying proof mechanisms where available.

## IANA Considerations

This draft does not yet request any IANA registrations.

## Conformance

A conforming P401 verifier:

- returns `401 Unauthorized` when proof is required and unsatisfied
- includes `WWW-Authenticate: P401 ...`
- returns a valid P401 envelope
- uses OIDC4VP for the proof request
- optionally includes OIDC4VCI issuance hints
- keeps payment separate under `402 Payment Required`

A conforming P401 client:

- recognizes `WWW-Authenticate: P401`
- processes the P401 envelope
- fulfills or escalates the OIDC4VP proof request
- treats OIDC4VCI acquisition hints as optional and non-authoritative
- supports separate handling of `402 Payment Required`

## References

### Normative

- [RFC 9110: HTTP Semantics](https://datatracker.ietf.org/doc/html/rfc9110)
- [RFC 2119: Key words for use in RFCs to Indicate Requirement Levels](https://datatracker.ietf.org/doc/html/rfc2119)
- [RFC 8174: Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words](https://datatracker.ietf.org/doc/html/rfc8174)
- [RFC 6749: The OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 8414: OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 9101: OAuth 2.0 JWT-Secured Authorization Request (JAR)](https://datatracker.ietf.org/doc/html/rfc9101)
- [OpenID for Verifiable Presentations 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0-final.html)
- [OpenID for Verifiable Credential Issuance 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0-final.html)

### Informative

- [DIF Presentation Exchange](https://identity.foundation/presentation-exchange/)
- [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model/)
- [W3C Digital Credentials API](https://www.w3.org/TR/digital-credentials/)

## Appendix A: Minimal Envelope

::: example Minimal P401 Envelope
```json
{
  "scheme": "P401",
  "version": "0.1.0",
  "scope": {
    "route": "/resource/:id",
    "method": "GET",
    "aud": "did:web:api.example.com"
  },
  "proof": {
    "request_format": "openid4vp",
    "mode": "by_reference",
    "client_id": "x509_san_dns:api.example.com",
    "request_uri": "https://api.example.com/p401/requests/c-123"
  }
}
```
:::

## Appendix B: Design Summary

P401 is best understood as:

- an HTTP route challenge protocol
- wrapping OIDC4VP for proof fulfillment
- optionally pointing to OIDC4VCI issuance sources
- remaining orthogonal to payment protocols
- composing with `402 Payment Required` rather than absorbing it
