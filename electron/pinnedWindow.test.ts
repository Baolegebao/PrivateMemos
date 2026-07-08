import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => process.cwd(),
    requestSingleInstanceLock: () => true,
    on: vi.fn(),
    whenReady: () => new Promise(() => undefined)
  },
  BrowserWindow: vi.fn(),
  Menu: { setApplicationMenu: vi.fn() },
  Tray: vi.fn(),
  clipboard: {},
  dialog: {},
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() },
  ipcMain: { handle: vi.fn() },
  nativeImage: { createFromDataURL: vi.fn(), createFromPath: vi.fn() },
  shell: {}
}));

describe('pinned note window', () => {
  it('renders clipboard file image markdown as an image tag', async () => {
    const { renderPinnedNoteContent } = await import('./main.js');
    const content = renderPinnedNoteContent('![图片](file:///D:/待分类/Private%20Memos/剪贴板图片.png)');

    expect(content).toContain('<img src="file:///D:/待分类/Private%20Memos/剪贴板图片.png" alt="笔记图片" />');
  });
});
