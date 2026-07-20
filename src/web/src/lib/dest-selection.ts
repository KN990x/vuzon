import type { Destination } from './types';
import { isVerifiedStatus } from './verification';

export interface DestSelectionState {
  selectedValue: string;
  hasEnabledOption: boolean;
}

export function getDestSelectionState(
  list: Destination[] | null | undefined,
  previousValue = '',
): DestSelectionState {
  const items = Array.isArray(list) ? list : [];
  const prev = typeof previousValue === 'string' ? previousValue : '';
  let firstEnabled = '';
  let preservedSelection = '';

  for (const item of items) {
    const email = typeof item?.email === 'string' ? item.email : '';
    if (!email) {
      continue;
    }

    const isVerified = isVerifiedStatus(item?.verified);
    if (isVerified && !firstEnabled) {
      firstEnabled = email;
    }

    if (!preservedSelection && isVerified && email === prev) {
      preservedSelection = email;
      break;
    }
  }

  const selectedValue = preservedSelection || firstEnabled || '';
  const hasEnabledOption = firstEnabled !== '';

  return {
    selectedValue,
    hasEnabledOption,
  };
}
