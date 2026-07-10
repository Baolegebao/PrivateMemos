import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, '.tmp', 'desktop-package');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(root, 'dist'), path.join(target, 'dist'), { recursive: true });
await cp(path.join(root, 'dist-electron'), path.join(target, 'dist-electron'), { recursive: true });
await cp(path.join(root, 'assets', 'private-memos.ico'), path.join(target, 'assets', 'private-memos.ico'), { recursive: true });

await writeFile(path.join(target, 'package.json'), `${JSON.stringify({
  name: 'private-memos-desktop',
  productName: 'Private Memos',
  version: '0.3.1',
  private: true,
  type: 'module',
  main: 'dist-electron/main.js',
  build: {
    appId: 'com.privatememos.desktop',
    productName: 'Private Memos',
    electronVersion: '43.0.0',
    files: [
      'dist/**',
      'dist-electron/**',
      'assets/**',
      'node_modules/**',
      'package.json'
    ],
    directories: {
      output: '../../release-installer'
    },
    win: {
      target: 'nsis',
      icon: 'assets/private-memos.ico'
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      shortcutName: 'Private Memos'
    }
  },
  dependencies: {
    '@supabase/supabase-js': '^2.110.0',
    'lucide-react': '^0.468.0',
    react: '^18.3.1',
    'react-dom': '^18.3.1'
  }
}, null, 2)}\n`);

execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd install --omit=dev --package-lock=false --ignore-scripts'], {
  cwd: target,
  stdio: 'inherit'
});
