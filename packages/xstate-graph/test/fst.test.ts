import { FST } from 'xstate/lib/fst';
import { getShortestPathsFST } from '../src/shortestPaths';

describe('fst', () => {
  it('should', () => {
    class Jugs {
      public three = 0;
      public five = 0;

      public fillThree() {
        this.three = 3;
      }
      public fillFive() {
        this.five = 5;
      }
      public emptyThree() {
        this.three = 0;
      }
      public emptyFive() {
        this.five = 0;
      }
      public transferThree() {
        const poured = Math.min(5 - this.five, this.three);

        this.three = this.three - poured;
        this.five = this.five + poured;
      }
      public transferFive() {
        const poured = Math.min(3 - this.three, this.five);

        this.three = this.three + poured;
        this.five = this.five - poured;
      }
    }

    const dieHardFst: FST<
      [number, number],
      | { type: 'FILL_3' }
      | { type: 'FILL_5' }
      | { type: 'EMPTY_3' }
      | { type: 'EMPTY_5' }
      | { type: 'TRANSFER_3' }
      | { type: 'TRANSFER_5' }
    > = {
      transition: (gallons, event) => {
        const jugs = new Jugs();
        [jugs.three, jugs.five] = gallons;

        switch (event.type) {
          case 'EMPTY_3':
            jugs.emptyThree();
            break;
          case 'EMPTY_5':
            jugs.emptyFive();
            break;
          case 'FILL_3':
            jugs.fillThree();
            break;
          case 'FILL_5':
            jugs.fillFive();
            break;
          case 'TRANSFER_3':
            jugs.transferThree();
            break;
          case 'TRANSFER_5':
            jugs.transferFive();
            break;
          default:
            break;
        }

        return [[jugs.three, jugs.five]];
      },
      initialState: [0, 0],
      nextEvents: () => [
        { type: 'FILL_3' },
        { type: 'FILL_5' },
        { type: 'EMPTY_3' },
        { type: 'EMPTY_5' },
        { type: 'TRANSFER_3' },
        { type: 'TRANSFER_5' }
      ]
    };

    const shortestPaths = getShortestPathsFST(dieHardFst, {
      stateSerializer: ([three, five]) => JSON.stringify([three, five])
    });

    const pathsToFour = Object.values(shortestPaths).filter(({ state }) => {
      return state[1] === 4;
    });

    expect(pathsToFour).toMatchSnapshot();
  });
});
