import { createMachine } from '../src/index';

describe('strict mode', () => {
  const pedestrianStates = {
    initial: 'walk',
    states: {
      walk: {
        on: {
          PED_COUNTDOWN: 'wait'
        },
        entry: 'enter_walk',
        exit: 'exit_walk'
      },
      wait: {
        on: {
          PED_COUNTDOWN: 'stop'
        },
        entry: 'enter_wait',
        exit: 'exit_wait'
      },
      stop: {
        type: 'final' as const,
        entry: 'enter_stop',
        exit: 'exit_stop'
      }
    }
  };

  const lightMachine = createMachine({
    strict: true,
    key: 'light',
    initial: 'green',
    states: {
      green: {
        on: {
          TIMER: 'yellow',
          POWER_OUTAGE: 'red',
          NOTHING: 'green'
        },
        entry: 'enter_green',
        exit: 'exit_green'
      },
      yellow: {
        on: {
          TIMER: 'red',
          POWER_OUTAGE: 'red'
        },
        entry: 'enter_yellow',
        exit: 'exit_yellow'
      },
      red: {
        on: {
          TIMER: 'green',
          POWER_OUTAGE: 'red',
          NOTHING: 'red'
        },
        entry: 'enter_red',
        exit: 'exit_red',
        ...pedestrianStates
      }
    }
  });

  it('should throw for unacceptable events', () => {
    expect(() => {
      lightMachine.transition('green', 'FOO');
    }).toThrow();
  });

  it('should not throw for built-in events', () => {
    expect(() => {
      lightMachine.transition({ red: 'wait' }, 'PED_COUNTDOWN');
    }).not.toThrow();
  });
});
