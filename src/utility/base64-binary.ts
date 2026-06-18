import { ValueTransformer } from 'typeorm';

export type BinaryLike = Buffer | Uint8Array | ArrayBuffer;
export type Base64BinaryStorage = 'postgres-bytea' | 'binary';

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

export function binaryToPostgresByteaHex(value: BinaryLike): string {
  return `\\x${binaryToBuffer(value).toString('hex')}`;
}

export function base64OrBinaryToBuffer(value: string | BinaryLike): Buffer {
  if (isBinaryLike(value)) {
    return binaryToBuffer(value);
  }
  return Buffer.from(String(value), 'base64');
}

export function base64OrBinaryToDatabaseValue(
  value: string | BinaryLike,
  storage: Base64BinaryStorage = 'postgres-bytea',
): Buffer | string {
  const buffer = base64OrBinaryToBuffer(value);
  if (storage === 'postgres-bytea') {
    return binaryToPostgresByteaHex(buffer);
  }
  return buffer;
}

/**
 * Bridges a base64 `string` on the entity/API side with raw binary storage in
 * the database.
 *
 * - `to` (entity -> DB): a base64 string is decoded into a database-safe bytea
 *   value. If the incoming value is already binary (Buffer / Uint8Array /
 *   ArrayBuffer) it is treated as the binary payload itself and stored directly.
 * - `from` (DB -> entity): the stored binary is encoded back into a base64
 *   string.
 */
export class Base64BinaryTransformer implements ValueTransformer {
  constructor(
    private readonly storage: Base64BinaryStorage = 'postgres-bytea',
  ) {}

  to(
    entValue: string | BinaryLike | null | undefined,
  ): Buffer | string | null | undefined {
    if (entValue == null) {
      return entValue as null | undefined;
    }
    return base64OrBinaryToDatabaseValue(entValue, this.storage);
  }

  from(
    dbValue: BinaryLike | string | null | undefined,
  ): string | null | undefined {
    if (dbValue == null) {
      return dbValue as null | undefined;
    }
    if (isBinaryLike(dbValue)) {
      return binaryToBuffer(dbValue).toString('base64');
    }
    const text = String(dbValue);
    if (/^\\x[0-9a-f]*$/i.test(text)) {
      return Buffer.from(text.slice(2), 'hex').toString('base64');
    }
    return Buffer.from(text).toString('base64');
  }
}
