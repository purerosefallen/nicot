import { plainToInstance, instanceToPlain } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Entity } from 'typeorm';
import { Base64BinaryColumn, QueryBase64Equal } from '../src/decorators';
import {
  Base64BinaryTransformer,
  binaryToBuffer,
  isBinaryLike,
} from '../src/utility/base64-binary';
import { IdBase } from '../src/bases';
import { RestfulFactory } from '../src/restful';
import { getApiProperty } from 'nesties';

@Entity()
class Blob extends IdBase() {
  @Base64BinaryColumn()
  data: string;

  @Base64BinaryColumn({ columnType: 'longblob' })
  @QueryBase64Equal()
  signature: string;
}

const HELLO = 'hello world';
const HELLO_B64 = Buffer.from(HELLO).toString('base64');

describe('Base64BinaryTransformer', () => {
  const transformer = new Base64BinaryTransformer();

  it('encodes a base64 string into a Buffer when writing to DB', () => {
    const out = transformer.to(HELLO_B64);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect((out as Buffer).toString()).toBe(HELLO);
  });

  it('decodes a DB Buffer back into a base64 string', () => {
    const out = transformer.from(Buffer.from(HELLO));
    expect(out).toBe(HELLO_B64);
  });

  it('round-trips base64 <-> binary', () => {
    expect(transformer.from(transformer.to(HELLO_B64))).toBe(HELLO_B64);
  });

  it('passes nullish values through untouched', () => {
    expect(transformer.to(null)).toBeNull();
    expect(transformer.to(undefined)).toBeUndefined();
    expect(transformer.from(null)).toBeNull();
    expect(transformer.from(undefined)).toBeUndefined();
  });

  it('accepts a Buffer at insert time as the binary itself', () => {
    const buf = Buffer.from(HELLO);
    const out = transformer.to(buf);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect((out as Buffer).toString()).toBe(HELLO);
  });

  it('accepts a Uint8Array at insert time as the binary itself', () => {
    const arr = new Uint8Array(Buffer.from(HELLO));
    const out = transformer.to(arr);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect((out as Buffer).toString()).toBe(HELLO);
  });

  it('accepts an ArrayBuffer at insert time as the binary itself', () => {
    const u8 = new Uint8Array(Buffer.from(HELLO));
    const out = transformer.to(u8.buffer);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect((out as Buffer).toString()).toBe(HELLO);
  });

  it('honors the byteOffset / byteLength of a Uint8Array view', () => {
    const base = Buffer.from('XXhello worldYY');
    const view = new Uint8Array(base.buffer, base.byteOffset + 2, HELLO.length);
    const out = transformer.to(view);
    expect((out as Buffer).toString()).toBe(HELLO);
  });
});

describe('isBinaryLike / binaryToBuffer', () => {
  it('detects binary payloads', () => {
    expect(isBinaryLike(Buffer.from('a'))).toBe(true);
    expect(isBinaryLike(new Uint8Array(1))).toBe(true);
    expect(isBinaryLike(new ArrayBuffer(1))).toBe(true);
    expect(isBinaryLike('a')).toBe(false);
    expect(isBinaryLike(123)).toBe(false);
    expect(isBinaryLike(null)).toBe(false);
  });

  it('converts every binary type to a Buffer with the same bytes', () => {
    const buf = Buffer.from(HELLO);
    expect(binaryToBuffer(buf).toString()).toBe(HELLO);
    expect(binaryToBuffer(new Uint8Array(buf)).toString()).toBe(HELLO);
    expect(binaryToBuffer(new Uint8Array(buf).buffer).toString()).toBe(HELLO);
  });
});

describe('Base64BinaryColumn validation', () => {
  it('accepts a valid base64 string', () => {
    const errors = validateSync(plainToInstance(Blob, { data: HELLO_B64 }));
    expect(errors).toEqual([]);
  });

  it('accepts a Buffer as the value', () => {
    const blob = plainToInstance(Blob, {});
    blob.data = Buffer.from(HELLO) as unknown as string;
    expect(validateSync(blob)).toEqual([]);
  });

  it('accepts a Uint8Array as the value', () => {
    const blob = plainToInstance(Blob, {});
    blob.data = new Uint8Array(Buffer.from(HELLO)) as unknown as string;
    expect(validateSync(blob)).toEqual([]);
  });

  it('accepts an ArrayBuffer as the value', () => {
    const blob = plainToInstance(Blob, {});
    blob.data = new Uint8Array(Buffer.from(HELLO)).buffer as unknown as string;
    expect(validateSync(blob)).toEqual([]);
  });

  it('rejects a non-base64 string', () => {
    const errors = validateSync(
      plainToInstance(Blob, { data: 'not base64 !!!' }),
    );
    expect(errors).not.toEqual([]);
  });

  it('rejects a plain number', () => {
    const errors = validateSync(
      plainToInstance(Blob, { data: 123 as unknown as string }),
    );
    expect(errors).not.toEqual([]);
  });

  it('keeps the base64 string untouched through class-transformer', () => {
    const plain = instanceToPlain(plainToInstance(Blob, { data: HELLO_B64 }));
    expect(plain.data).toBe(HELLO_B64);
  });
});

describe('Base64BinaryColumn API disguise + query behavior', () => {
  it('is exposed to OpenAPI as a base64 string field', () => {
    const prop: any = getApiProperty(Blob, 'data');
    expect(prop.type).toBe(String);
    expect(prop.format).toBe('byte');
  });

  it('keeps base64 columns in the find DTO (queryable, no RequireMutator)', () => {
    const factory = new RestfulFactory(Blob);
    expect(factory.fieldsInGetToOmit).not.toContain('data');
    expect(factory.fieldsInGetToOmit).not.toContain('signature');
  });

  it('lets findAll filter a base64 column when a query operator is attached', () => {
    const factory = new RestfulFactory(Blob);
    expect(factory.queryableFields).toContain('signature');
  });
});
