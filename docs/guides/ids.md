# Identifying State Nodes

[:rocket: Quick Reference](#quick-reference)

By default, a state node's `id` is its delimited full path. You can use this default `id` to specify a state node:

```js
const lightMachine = createMachine({
  id: 'light',
  initial: 'green',
  states: {
    green: {
      // default ID: 'light.green'
      on: {
        // You can target state nodes by their default ID.
        // This is the same as TIMER: 'yellow'
        TIMER: { target: '#light.yellow' }
      }
    },
    yellow: {
      on: {
        TIMER: { target: 'red' }
      }
    },
    red: {
      on: {
        TIMER: { target: 'green' }
      }
    }
  }
});
```

## Relative Targets

Child state nodes can be targeted relative to their parent by specifying a dot (`'.'`) followed by their key:

```js {10-12}
const optionsMachine = createMachine({
  id: 'options',
  initial: 'first',
  states: {
    first: {},
    second: {},
    third: {}
  },
  on: {
    SELECT_FIRST: { target: '.first' }, // resolves to 'options.first'
    SELECT_SECOND: { target: '.second' }, // 'options.second'
    SELECT_THIRD: { target: '.third' } // 'options.third'
  }
});
```

By default, relative targets are [internal transitions](./transitions.md#internal-transitions), which means the parent state will _not_ exit and reenter. You can make relative targets external transitions by specifying `internal: false`:

```js {4}
// ...
on: {
  SELECT_FIRST: {
    target: { target: '.first' },
    internal: false // external transition, will exit/reenter parent state node
  }
}
```

## Custom IDs

State nodes can be targeted via unique identifiers, instead of by relative identifiers. This can simplify the creation of complex statecharts.

To specify an ID for a state node, provide a unique string identifier as its `id` property, e.g., `id: 'greenLight'`.

To target a state node by its ID, prepend the `'#'` symbol to its string ID, e.g., `TIMER: '#greenLight'`.

```js
const lightMachine = createMachine({
  id: 'light',
  initial: 'green',
  states: {
    green: {
      // custom identifier
      id: 'greenLight',
      on: {
        // target state node by its ID
        TIMER: { target: '#yellowLight' }
      }
    },
    yellow: {
      id: 'yellowLight',
      on: {
        TIMER: { target: '#redLight' }
      }
    },
    red: {
      id: 'redLight',
      on: {
        // relative targets will still work
        TIMER: { target: 'green' }
      }
    }
  }
});
```

**Notes:**

- IDs are always recommended for the root state node.
- IDs are useful for SCXML compatibility, and conversion to/from SCXML will make use of IDs extensively.
- Make sure that all IDs are unique in order to prevent naming conflicts. This is naturally enforced by the automatically generated IDs.

::: warning
Do not mix custom identifiers with relative identifiers. For example, if the `red` state node above has a custom `"redLight"` ID and a child `walking` state node, e.g.:

```js
// ...
red: {
  id: 'redLight',
  initial: 'walking',
  states: {
    // ID still resolves to 'light.red.walking'
    walking: {/* ... */},
    // ...
  }
}
// ...
```

Then you cannot target the `'walking'` state via `'#redLight.walking'`, because its ID is resolved to `'#light.red.walking'`. A target that starts with `'#'` will always refer to the _exact match_ for the `'#[state node ID]'`.
:::

## SCXML

IDs correspond to the definition of IDs in the SCXML spec:

```js
{
  green: {
    id: 'lightGreen';
  }
}
```

```xml
<state id="lightGreen">
  <!-- ... -->
</state>
```

- [https://www.w3.org/TR/scxml/#IDs](https://www.w3.org/TR/scxml/#IDs) - specification that all `id` attributes _must_ be unique
- [https://www.w3.org/TR/scxml/#state](https://www.w3.org/TR/scxml/#state) - see the definition of the `id` attribute in `<state>`

## Quick Reference

**Default, automatically generated ID:**

```js
const lightMachine = createMachine({
  id: 'light',
  initial: 'green',
  states: {
    // ID: "light.green"
    green: {
      /* ... */
    },
    // ID: "light.yellow"
    yellow: {
      /* ... */
    },
    // ID: "light.red"
    red: {
      /* ... */
    }
  }
});
```

**Custom ID**

```js
// ...
states: {
  active: {
    id: 'custom-active', // can be any unique string
    // ...
  }
}
```

**Targeting state node by ID:**

```js
// ...
on: {
  EVENT: { target: '#light.yellow' }, // target default ID
  ANOTHER_EVENT: { target: '#custom-id' } // target custom ID
}
```
