import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  JsonColumn,
  SimpleJsonColumn,
  StringJsonColumn,
} from '../src/decorators';

class PrimitiveArrayJsonEntity {
  @JsonColumn([String])
  strings: string[];

  @JsonColumn([Number])
  numbers: number[];

  @JsonColumn([Boolean])
  flags: boolean[];

  @JsonColumn([Date])
  dates: Date[];
}

class PrimitiveScalarJsonEntity {
  @JsonColumn(String)
  text: string;

  @JsonColumn(Number)
  count: number;

  @JsonColumn(Boolean)
  active: boolean;

  @JsonColumn(Date)
  at: Date;
}

class JsonColumnVariantEntity {
  @SimpleJsonColumn([String])
  simpleStrings: string[];

  @StringJsonColumn([Number])
  stringJsonNumbers: number[];
}

describe('JsonColumn primitive validation', () => {
  it('accepts primitive array definitions', () => {
    const entity = plainToInstance(PrimitiveArrayJsonEntity, {
      strings: ['a', 'b'],
      numbers: ['1', 2],
      flags: [true, false],
      dates: ['2024-01-02T00:00:00.000Z'],
    });

    expect(validateSync(entity)).toEqual([]);
  });

  it('keeps class-transformer conversion for number and date arrays', () => {
    const entity = plainToInstance(PrimitiveArrayJsonEntity, {
      numbers: ['42'],
      dates: ['2024-01-02T00:00:00.000Z'],
    });

    expect(entity.numbers).toEqual([42]);
    expect(entity.dates[0]).toBeInstanceOf(Date);
    expect(entity.dates[0].toISOString()).toBe('2024-01-02T00:00:00.000Z');
    expect(validateSync(entity)).toEqual([]);
  });

  it('rejects non-array values for array definitions', () => {
    const entity = plainToInstance(PrimitiveArrayJsonEntity, {
      strings: 'not-array',
    });

    const errors = validateSync(entity);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('strings');
    expect(errors[0].constraints).toHaveProperty('isArray');
  });

  it('accepts primitive scalar definitions', () => {
    const entity = plainToInstance(PrimitiveScalarJsonEntity, {
      text: 'hello',
      count: '42',
      active: true,
      at: '2024-01-02T00:00:00.000Z',
    });

    expect(entity.count).toBe(42);
    expect(entity.at).toBeInstanceOf(Date);
    expect(validateSync(entity)).toEqual([]);
  });

  it('shares primitive array validation across json column variants', () => {
    const entity = plainToInstance(JsonColumnVariantEntity, {
      simpleStrings: ['a'],
      stringJsonNumbers: ['1', 2],
    });

    expect(entity.stringJsonNumbers).toEqual([1, 2]);
    expect(validateSync(entity)).toEqual([]);
  });
});
