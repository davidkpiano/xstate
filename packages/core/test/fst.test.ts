import { fromReducer } from '../src/fst';

describe('fst', () => {
  describe('fromReducer', () => {
    it('should create an FST from a reducer', () => {
      const fst = fromReducer((count: number, input: number) => {
        return count + input;
      }, 0);

      expect(fst.transition(3, 1)).toStrictEqual([4, undefined]);
    });
  });
});
