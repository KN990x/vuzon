import { expect, test } from 'vitest';
import { getDestSelectionState } from './dest-selection';
import type { Destination } from './types';

const verified = (id: string, email: string): Destination => ({ id, email, verified: true });
const pending = (id: string, email: string): Destination => ({ id, email, verified: null });

test('sin destinos: selección vacía y sin opciones habilitadas', () => {
  expect(getDestSelectionState([])).toEqual({ selectedValue: '', hasEnabledOption: false });
  expect(getDestSelectionState(null)).toEqual({ selectedValue: '', hasEnabledOption: false });
});

test('selecciona el primer destino verificado', () => {
  const state = getDestSelectionState([pending('1', 'p@x.com'), verified('2', 'v@x.com')]);
  expect(state).toEqual({ selectedValue: 'v@x.com', hasEnabledOption: true });
});

test('conserva la selección previa si sigue verificada', () => {
  const state = getDestSelectionState(
    [verified('1', 'a@x.com'), verified('2', 'b@x.com')],
    'b@x.com',
  );
  expect(state.selectedValue).toBe('b@x.com');
});

test('descarta la selección previa si ya no está verificada', () => {
  const state = getDestSelectionState(
    [verified('1', 'a@x.com'), pending('2', 'b@x.com')],
    'b@x.com',
  );
  expect(state.selectedValue).toBe('a@x.com');
});

test('solo destinos sin verificar: sin selección', () => {
  const state = getDestSelectionState([pending('1', 'p@x.com')]);
  expect(state).toEqual({ selectedValue: '', hasEnabledOption: false });
});

test('ignora entradas sin email', () => {
  const state = getDestSelectionState([
    { id: '1', email: '', verified: true },
    verified('2', 'ok@x.com'),
  ]);
  expect(state.selectedValue).toBe('ok@x.com');
});
