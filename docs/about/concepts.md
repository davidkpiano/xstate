# Concepts

XState is a library for creating, interpreting, and executing finite state machines and statecharts. It also provides tools for managing invocations of those machines as actors. The following fundamental computer science concepts are important to know how to make the best use of XState, and in general, for all your current and future software projects.

## Finite State Machines

A finite state machine is a mathematical model of computation that describes the behavior of a system that can be in only one state at any given time. For example, let's say you are represented by a state machine with a finite number (2) of states: `asleep` or `awake`. At any given time, you're either `asleep` or `awake`. It is impossible for you to be both `asleep` and `awake` simultaneously, and it is impossible for you to be neither `asleep` nor `awake`.

Formally, finite state machines have five parts:

- A finite number of **states**
- A finite number of **events**
- An **initial state**
- A **transition function** that determines the next state given the current state and event
- A (possibly empty) set of **final states**

**State** refers to some finite, _qualitative_ "mode" or "status" of a system being modeled by a state machine and does not describe all the (possibly infinite) data related to that system. For example, water can be in 1 of 4 states: `ice`, `liquid`, `gas`, or `plasma`. However, the temperature of water can vary, and its measurement is _quantitative_ and infinite.

More resources:

- [Finite-state machine](https://en.wikipedia.org/wiki/Finite-state_machine) article on Wikipedia
- [Understanding State Machines](https://www.freecodecamp.org/news/state-machines-basics-of-computer-science-d42855debc66/) by Mark Shead
- [▶️ A-Level Comp Sci: Finite State Machine](https://www.youtube.com/watch?v=4rNYAvsSkwk)

## Statecharts

Statecharts are a formalism for modeling stateful, reactive systems. Computer scientist David Harel presented this formalism as an extension to state machines in his 1987 paper [Statecharts: A Visual Formalism For Complex Systems](https://www.sciencedirect.com/science/article/pii/0167642387900359/pdf). Some of the extensions include:

- Guarded transitions
- Actions (entry, exit, transition)
- Extended state (context)
- Orthogonal (parallel) states
- Hierarchical (nested) states
- History

More resources:

- [Statecharts: A Visual Formalism For Complex Systems](https://www.sciencedirect.com/science/article/pii/0167642387900359/pdf) by David Harel
- [The World of Statecharts](https://statecharts.github.io/) by Erik Mogensen

## Actor Model

The actor model is another very old mathematical model of computation that goes well with state machines. It states that everything is an "actor" that can do three things:

- **Receive** messages
- **Send** messages to other actors
- Do something with the messages it received (its **behavior**), such as:
  - change its local state
  - send messages to other actors
  - _spawn_ new actors

An actor's behavior can be described by a state machine (or a statechart).

More resources:

- [Actor model](https://en.wikipedia.org/wiki/Actor_model) article on Wikipedia
- [The actor model in 10 minutes](https://www.brianstorti.com/the-actor-model/) by Brian Storti
