# Sequence

A sequence are a number of steps that happen in a specific order, and one at a time. This can be modeled with a state machine:

```js
const stepMachine = createMachine({
  id: 'step',
  initial: 'one',
  states: {
    one: {
      on: { NEXT: 'two' }
    },
    two: {
      on: { NEXT: 'three', PREV: 'one' }
    },
    three: {
      type: 'final'
    }
  }
});

console.log(stepMachine.transition('one', 'NEXT').value);
// => 'two'
```

In this example, the machine is in the steps `'one'`, `'two'`, or `'three'`, and transitions between them in that order on the `'NEXT'` event until it reaches the last step. The `'PREV'` event is optional and allows the machine to go to a previous step.

Modeling the final step of the sequence as a [final state](../guides/final.md) with `{ type: 'final' }` makes it easier for the machine to be invoked by another machine, or used as a child machine of a bigger machine since `onDone` can be defined on the parent machine as a transition when the sequence machine reaches its final state.

## Async Sequences

Sometimes, many async (e.g., Promise-based) operations need to occur in sequence. This can be modeled similarly by [invoking](../guides/communication.md) the services in sequence:

```js
// Returns a Promise, e.g.:
// {
//   id: 42,
//   name: 'David',
//   friends: [2, 3, 5, 7, 9] // friend IDs
// }
function getUserInfo(context) {
  return fetch(`/api/users/${context.userId}`).then((response) =>
    response.json()
  );
}

// Returns a Promise
function getUserFriends(context) {
  const { friends } = context.user;

  return Promise.all(
    friends.map((friendId) =>
      fetch(`/api/users/${friendId}/`).then((response) => response.json())
    )
  );
}

const friendsMachine = createMachine({
  id: 'friends',
  context: { userId: 42, user: undefined, friends: undefined },
  initial: 'gettingUser',
  states: {
    gettingUser: {
      invoke: {
        src: getUserInfo,
        onDone: {
          target: 'gettingFriends',
          actions: assign({
            user: (context, event) => event.data
          })
        }
      }
    },
    gettingFriends: {
      invoke: {
        src: getUserFriends,
        onDone: {
          target: 'success',
          actions: assign({
            friends: (context, event) => event.data
          })
        }
      }
    },
    success: {
      type: 'final'
    }
  }
});
```
