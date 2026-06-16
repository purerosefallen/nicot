import { ValueTransformer } from 'typeorm';

export type BinaryLike = Buffer | Uint8Array | ArrayBuffer;

/**
 * Whether the value is a raw binary payload (Buffer / Uint8Array / ArrayBuffer).
 * Such values are considered "already the binary" and are accepted as-is even
 * though the TS-level type of a base64 binary column is a base64 `string`.
 */
export function isBinaryLike(value: unknown): value is BinaryLike {
  return (
    Buffer.isBuffer(value) ||
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer
  );
}

export function binaryToBuffer(value: BinaryLike): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  // ArrayBuffer
  return Buffer.from(new Uint8Array(value));
}

/**
 * Bridges a base64 `string` on the entity/API side with raw binary storage in
 * the database.
 *
 * - `to` (entity -> DB): a base64 string is decoded into a `Buffer`. If the
 *   incoming value is already binary (Buffer / Uint8Array / ArrayBuffer) it is
 *   treated as the binary payload itself and stored directly.
 * - `from` (DB -> entity): the stored binary is encoded back into a base64
 *   string.
 */
export class Base64BinaryTransformer implements ValueTransformer {
  to(
    entValue: string | BinaryLike | null | undefined,
  ): Buffer | null | undefined {
    if (entValue == null) {
      return entValue as null | undefined;
    }
    if (isBinaryLike(entValue)) {
      return binaryToBuffer(entValue);
    }
    return Buffer.from(String(entValue), 'base64');
  }

  from(dbValue: BinaryLike | null | undefined): string | null | undefined {
    if (dbValue == null) {
      return dbValue as null | undefined;
    }
    if (isBinaryLike(dbValue)) {
      return binaryToBuffer(dbValue).toString('base64');
    }
    return Buffer.from(String(dbValue)).toString('base64');
  }
}
