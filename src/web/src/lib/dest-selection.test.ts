import { expect, test } from 'vitest';
import { DROP_DEST_VALUE, getDestSelectionState } from './dest-selection';
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

// Regression: every mutation and every manual refresh runs the result of this function back
// into the create form. Because DROP_DEST_VALUE is not the email of any destination, the
// preservation loop never matched it and the selection fell back to the first verified
// address — so "discard the mail" silently became "forward to the first destination", and
// the alias the user then created did the opposite of what they picked.
test('keeps "discard the mail" across a refresh, even as the list changes', () => {
  expect(
    getDestSelectionState([verified('1', 'a@x.com')], DROP_DEST_VALUE),
  ).toEqual({ selectedValue: DROP_DEST_VALUE, hasEnabledOption: true });

  // A destination was just added: the refresh that follows must not steal the choice.
  expect(
    getDestSelectionState(
      [verified('1', 'a@x.com'), verified('2', 'b@x.com')],
      DROP_DEST_VALUE,
    ).selectedValue,
  ).toBe(DROP_DEST_VALUE);
});

test('"discard the mail" survives with no verified destinations at all', () => {
  expect(getDestSelectionState([], DROP_DEST_VALUE)).toEqual({
    selectedValue: DROP_DEST_VALUE,
    hasEnabledOption: false,
  });
  expect(getDestSelectionState([pending('1', 'p@x.com')], DROP_DEST_VALUE)).toEqual({
    selectedValue: DROP_DEST_VALUE,
    hasEnabledOption: false,
  });
});
