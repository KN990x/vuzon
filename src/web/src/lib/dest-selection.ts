import type { Destination } from './types';
import { isVerifiedStatus } from './verification';

/**
 * Sentinel for the "discard the mail" entry of the create form's destination select.
 *
 * It lives here rather than in AliasesCard because it is a value this module has to know
 * about: it is not the email of any destination, so the preservation loop below would never
 * match it and every refresh silently reset the choice to the first verified address —
 * turning a deliberate "discard" into a forwarding alias.
 */
export const DROP_DEST_VALUE = '__drop__';

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

  // "Discard the mail" is always available: it needs no destination, so it survives a
  // refresh whatever the address list looks like.
  if (prev === DROP_DEST_VALUE) {
    return {
      selectedValue: DROP_DEST_VALUE,
      hasEnabledOption: items.some(
        (item) => typeof item?.email === 'string' && item.email !== '' && isVerifiedStatus(item?.verified),
      ),
    };
  }

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
