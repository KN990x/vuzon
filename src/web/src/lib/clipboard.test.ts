import { afterEach, expect, test, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

function stubDocument(execCommandResult: boolean) {
  vi.stubGlobal('document', {
    body: {
      appendChild() {},
      removeChild() {},
    },
    createElement() {
      return { value: '', select() {} };
    },
    execCommand() {
      return execCommandResult;
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

  const result = await copyTextToClipboard('alias@example.com');
  expect(result).toEqual({ copied: true, failed: false });
});

test('Clipboard API fails and execCommand true: copies', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: async () => {
        throw new Error('denied');
      },
    },
  });
  const promptSpy = vi.fn();
  vi.stubGlobal('prompt', promptSpy);
  stubDocument(true);

  const result = await copyTextToClipboard('alias@example.com');
  expect(result).toEqual({ copied: true, failed: false });
  expect(promptSpy).not.toHaveBeenCalled();
});

test('Clipboard API and execCommand both fail: falls back to prompt and flags failure', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: async () => {
        throw new Error('denied');
      },
    },
  });
  const prompts: Array<{ msg: string; value: string }> = [];
  vi.stubGlobal('prompt', (msg: string, value: string) => {
    prompts.push({ msg, value });
    return value;
  });
  stubDocument(false);

  const result = await copyTextToClipboard('manual@example.com');
  expect(result).toEqual({ copied: false, failed: true });
  expect(prompts).toHaveLength(1);
  expect(prompts[0].value).toBe('manual@example.com');
});

test('prompt blocked (iframe/sandbox): still reports failure without throwing', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: async () => {
        throw new Error('denied');
      },
    },
  });
  vi.stubGlobal('prompt', () => {
    throw new Error('blocked');
  });
  stubDocument(false);

  const result = await copyTextToClipboard('x@y.com');
  expect(result).toEqual({ copied: false, failed: true });
});
