/// <reference types="vite/client" />

interface Window {
  assistantApp?: {
    platform: NodeJS.Platform;
    data?: {
      load: () => Promise<string | null>;
      save: (payload: string) => Promise<{ path: string; exists: boolean; directory: string; defaultDirectory: string; customDirectory?: string }>;
      status: () => Promise<{ path: string; exists: boolean; directory: string; defaultDirectory: string; customDirectory?: string }>;
      setDirectory: (directory: string, payload?: string) => Promise<{ path: string; exists: boolean; directory: string; defaultDirectory: string; customDirectory?: string }>;
      clearDirectory: (payload?: string) => Promise<{ path: string; exists: boolean; directory: string; defaultDirectory: string; customDirectory?: string }>;
    };
    file?: {
      chooseDirectory: () => Promise<string | undefined>;
      saveFiles: (files: Array<{ filename: string; content: Uint8Array }>, directory?: string) => Promise<{ canceled: boolean; paths: string[] }>;
      openPath: (targetPath: string) => Promise<string>;
    };
    window?: {
      pinNote: (payload: { title: string; body: string }) => Promise<{ ok: boolean }>;
    };
    clipboard?: {
      read: () => Promise<
        | { kind: 'empty' }
        | { kind: 'text'; text: string; signature: string }
        | { kind: 'image'; dataUrl: string; signature: string }
      >;
      saveText: (text: string, kind: 'text' | 'link', directory?: string) => Promise<{ path: string }>;
      saveImage: (dataUrl: string, directory?: string) => Promise<{ path: string }>;
      writeText: (text: string) => Promise<{ signature: string }>;
      writeImage: (source: string) => Promise<{ signature: string }>;
      chooseDirectory: () => Promise<string | undefined>;
      defaultDirectory: () => Promise<string>;
      registerShortcut: (accelerator: string) => Promise<{ ok: boolean; accelerator: string; message?: string }>;
    };
    appSettings?: {
      getLaunchAtLogin: () => Promise<boolean>;
      setLaunchAtLogin: (enabled: boolean) => Promise<boolean>;
    };
    navigation?: {
      onModule: (callback: (module: import('./domain/types').ModuleKey) => void) => () => void;
    };
  };
}
