import { gunzipSync, gzipSync } from "node:zlib";

export function createEncodedStatusList(options: {
  size: number;
  revokedIndices?: number[];
}): string {
  const bytes = Buffer.alloc(Math.ceil(options.size / 8));

  for (const index of options.revokedIndices ?? []) {
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    bytes[byteIndex] |= 1 << bitIndex;
  }

  return gzipSync(bytes).toString("base64url");
}

export function isStatusListRevoked(encodedList: string, index: number): boolean {
  const bytes = gunzipSync(Buffer.from(encodedList, "base64url"));
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  return ((bytes[byteIndex] ?? 0) & (1 << bitIndex)) !== 0;
}

export function createStatusListEntry(statusListCredentialUrl: string, statusListIndex: number) {
  return {
    id: `${statusListCredentialUrl}#${statusListIndex}`,
    type: "StatusList2021Entry",
    statusPurpose: "revocation",
    statusListIndex: String(statusListIndex),
    statusListCredential: statusListCredentialUrl,
  };
}

