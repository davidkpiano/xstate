import { createMachine, createSchema } from '../src';
import { JSONSchema6 } from 'json-schema';

export interface JSONSchemaObject<TK extends string> extends JSONSchema6 {
  type: 'object';
  properties: {
    [key in TK]: JSONSchema6;
  };
}

type JSONSchemaTypeFrom<T extends JSONSchema6> = T extends { type: 'string' }
  ? string
  : T extends { type: 'number' }
  ? number
  : T extends JSONSchemaObject<infer Keys>
  ? {
      [Key in Keys]: JSONSchemaTypeFrom<T['properties'][Key]>;
    }
  : unknown;

function fromJSONSchema<T extends JSONSchema6>(
  schema: T
): JSONSchemaTypeFrom<T> {
  return schema as any;
}

describe('schema', () => {
  it('should infer types from provided schema', () => {
    const noop = (_: any) => void 0;

    const m = createMachine({
      schema: {
        context: fromJSONSchema({
          type: 'object',
          properties: {
            foo: { type: 'string' },
            bar: { type: 'number' },
            baz: {
              type: 'object',
              properties: {
                one: { type: 'string' }
              }
            }
          }
        }),
        events: createSchema<{ type: 'FOO' } | { type: 'BAR' }>()
      },
      context: { foo: '', bar: 0, baz: { one: '' } },
      initial: 'active',
      states: {
        active: {
          entry: ['asdf']
        }
      }
    });

    noop(m.context.foo);
    noop(m.context.baz.one);
    m.transition('active', 'BAR');

    // @ts-expect-error
    noop(m.context.something);

    // @ts-expect-error
    m.transition('active', 'INVALID');
  });

  it('schema should be present in the machine definition', () => {
    const schema = {
      context: fromJSONSchema({
        type: 'object',
        properties: {
          foo: { type: 'string' }
        }
      })
    };

    const m = createMachine({
      schema,
      context: { foo: '' },
      initial: 'active',
      states: {
        active: {}
      }
    });

    expect(m.schema).toEqual(schema);
  });
});
