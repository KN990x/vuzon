import { afterEach, expect, test, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

interface StubTextArea {
  value: string;
  style: { cssText: string };
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  select(): void;
}

function stubDocument(execCommandResult: boolean) {
  const created: StubTextArea[] = [];
  const appended: StubTextArea[] = [];
  const removed: StubTextArea[] = [];

  vi.stubGlobal('document', {
    body: {
      appendChild(el: StubTextArea) {
        appended.push(el);
      },
      removeChild(el: StubTextArea) {
        removed.push(el);
      },
    },
    createElement() {
      const el: StubTextArea = {
        value: '',
        style: { cssText: '' },
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        select() {},
      };
      created.push(el);
      return el;
    },
    execCommand() {
      return execCommandResult;
    },
  });

  return { created, appended, removed };
}

function stubFailingClipboard() {
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: async () => {
        throw new Error('denied');
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('Clipboard API available: copies and does not fail', async () => {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: async () => {} },
  });

  expect(await copyTextToClipboard('alias@example.com')).toEqual({ copied: true, failed: false });
});

test('Clipboard API fails and execCommand true: copies', async () => {
  stubFailingClipboard();
  stubDocument(true);

  expect(await copyTextToClipboard('alias@example.com')).toEqual({ copied: true, failed: false });
});

test('both paths fail: reports failure so the caller can show the translated toast', async () => {
  stubFailingClipboard();
  stubDocument(false);

  // No prompt() tier any more: its buttons came from the browser's locale, it blocked the
  // main thread, and it was a silent no-op in a sandboxed iframe — exactly where a
  // fallback was supposed to help.
  const promptSpy = vi.fn();
  vi.stubGlobal('prompt', promptSpy);

  expect(await copyTextToClipboard('manual@example.com')).toEqual({ copied: false, failed: true });
  expect(promptSpy).not.toHaveBeenCalled();
});

test('the fallback textarea is off-screen, read-only, and always removed', async () => {
  stubFailingClipboard();
  const { created, appended, removed } = stubDocument(false);

  await copyTextToClipboard('manual@example.com');

  expect(created).toHaveLength(1);
  const el = created[0];
  if (!el) throw new Error('unreachable: the length assertion above guarantees one element');
  expect(el.value).toBe('manual@example.com');
  // Rendering it at default size for a frame caused a visible flash, and on iOS select()
  // on a focusable editable field scrolls and zooms the page.
  expect(el.attributes.readonly).toBe('');
  expect(el.style.cssText).toContain('position:fixed');
  expect(el.style.cssText).toContain('opacity:0');
  // Appended and removed exactly once, even on the failing path.
  expect(appended).toEqual([el]);
  expect(removed).toEqual([el]);
});
