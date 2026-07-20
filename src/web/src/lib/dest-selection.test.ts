import { expect, test } from 'vitest';
import { getDestSelectionState } from './dest-selection';
import type { Destination } from './types';

const verified = (id: string, email: string): Destination => ({ id, email, verified: true });
const pending = (id: string, email: string): Destination => ({ id, email, verified: null });

test('no destinations: empty selection and no enabled options', () => {
  expect(getDestSelectionState([])).toEqual({ selectedValue: '', hasEnabledOption: false });
  expect(getDestSelectionState(null)).toEqual({ selectedValue: '', hasEnabledOption: false });
});

test('selects the first verified destination', () => {
  const state = getDestSelectionState([pending('1', 'p@x.com'), verified('2', 'v@x.com')]);
  expect(state).toEqual({ selectedValue: 'v@x.com', hasEnabledOption: true });
});

test('keeps the previous selection if it is still verified', () => {
  const state = getDestSelectionState(
    [verified('1', 'a@x.com'), verified('2', 'b@x.com')],
    'b@x.com',
  );
  expect(state.selectedValue).toBe('b@x.com');
});

test('drops the previous selection once it is no longer verified', () => {
  const state = getDestSelectionState(
    [verified('1', 'a@x.com'), pending('2', 'b@x.com')],
    'b@x.com',
  );
  expect(state.selectedValue).toBe('a@x.com');
});

test('only unverified destinations: no selection', () => {
  const state = getDestSelectionState([pending('1', 'p@x.com')]);
  expect(state).toEqual({ selectedValue: '', hasEnabledOption: false });
});

test('ignores entries without an email', () => {
  const state = getDestSelectionState([
    { id: '1', email: '', verified: true },
    verified('2', 'ok@x.com'),
  ]);
  expect(state.selectedValue).toBe('ok@x.com');
});
