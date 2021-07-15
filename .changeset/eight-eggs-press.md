---
'@xstate/react': minor
---

Changed the behaviour of guards, delays and activities when declared as options in `useMachine`/`useInterpret`.

Previously, guards could not reference external props, because they would not be updated when the props changed. For instance:

```tsx
const Modal = (props) => {
  useMachine(modalMachine, {
    guards: {
      isModalOpen: () => props.isOpen
    }
  });
};
```

When the component is created, `props.isOpen` would be checked and evaluated to the initial value. But if the guard is evaluated at any other time, it will not respond to the props' changed value.

This is not true of actions/services. This will work as expected:

```tsx
const Modal = (props) => {
  useMachine(modalMachine, {
    actions: {
      consoleLogModalOpen: () => {
        console.log(props.isOpen);
      }
    }
  });
};
```

This change brings guards and delays into line with actions and services.

⚠️ **NOTE:** Whenever possible, use data from within `context` rather than external data in your guards and delays.
