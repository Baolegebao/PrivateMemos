import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('assistantApp', {
  platform: process.platform,
  data: {
    load: () => ipcRenderer.invoke('data:load'),
    save: (payload: string) => ipcRenderer.invoke('data:save', payload),
    status: () => ipcRenderer.invoke('data:status'),
    setDirectory: (directory: string, payload?: string) => ipcRenderer.invoke('data:setDirectory', directory, payload),
    clearDirectory: (payload?: string) => ipcRenderer.invoke('data:clearDirectory', payload)
  },
  file: {
    chooseDirectory: () => ipcRenderer.invoke('file:chooseDirectory'),
    saveFiles: (files: Array<{ filename: string; content: Uint8Array }>, directory?: string) => ipcRenderer.invoke('file:saveFiles', files, directory),
    openPath: (targetPath: string) => ipcRenderer.invoke('file:openPath', targetPath)
  },
  window: {
    pinNote: (payload: { title: string; body: string }) => ipcRenderer.invoke('window:pinNote', payload)
  },
  clipboard: {
    read: () => ipcRenderer.invoke('clipboard:read'),
    saveText: (text: string, kind: 'text' | 'link', directory?: string) => ipcRenderer.invoke('clipboard:saveText', text, kind, directory),
    saveImage: (dataUrl: string, directory?: string) => ipcRenderer.invoke('clipboard:saveImage', dataUrl, directory),
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
    writeImage: (source: string) => ipcRenderer.invoke('clipboard:writeImage', source),
    chooseDirectory: () => ipcRenderer.invoke('clipboard:chooseDirectory'),
    defaultDirectory: () => ipcRenderer.invoke('clipboard:defaultDirectory'),
    registerShortcut: (accelerator: string) => ipcRenderer.invoke('clipboard:registerShortcut', accelerator)
  },
  appSettings: {
    getLaunchAtLogin: () => ipcRenderer.invoke('app:getLaunchAtLogin'),
    setLaunchAtLogin: (enabled: boolean) => ipcRenderer.invoke('app:setLaunchAtLogin', enabled)
  },
  navigation: {
    onModule: (callback: (module: string) => void) => {
      const listener = (_event: IpcRendererEvent, module: string) => callback(module);
      ipcRenderer.on('navigate:module', listener);
      return () => ipcRenderer.removeListener('navigate:module', listener);
    }
  }
});
