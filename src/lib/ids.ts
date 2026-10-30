import { randomBytes } from "node:crypto";

const ID_BYTES = 12;

/** Opaque, prefixed text IDs keep rows identifiable in logs and support tickets. */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(ID_BYTES).toString("base64url")}`;
}

const CODE_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}
