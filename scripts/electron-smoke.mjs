import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const electronCli = path.join(root, 'node_modules', 'electron', 'cli.js');

const child = spawn(process.execPath, [electronCli, 'dist-electron/main.js'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_SMOKE_TEST: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (chunk) => {
  stdout += chunk;
});

child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

const exitCode = await new Promise((resolve) => {
  child.on('close', resolve);
});

const line = stdout.split(/\r?\n/).find((item) => item.trim().startsWith('{'));
if (!line) {
  console.error(stdout);
  console.error(stderr);
  throw new Error('Electron smoke test did not return JSON output.');
}

const payload = JSON.parse(line);
const result = payload.result ?? {};
const failures = [
  ['React root mounted', result.rootChildren > 0],
  ['Desktop bridge injected', result.hasDesktopBridge],
  ['Home module rendered', result.hasHome],
  ['Notes module rendered', result.hasNotes],
  ['Ledger module rendered', result.hasLedger],
  ['Settings module rendered', result.hasSettings]
].filter(([, ok]) => !ok);

if (exitCode !== 0 || !payload.ok || failures.length > 0) {
  console.error(JSON.stringify(payload, null, 2));
  console.error(stderr);
  throw new Error(`Electron smoke test failed: ${failures.map(([label]) => label).join(', ') || `exit ${exitCode}`}`);
}

console.log(JSON.stringify({
  ok: true,
  title: result.title,
  rootChildren: result.rootChildren,
  fields: result.fields,
  desktopBridge: result.hasDesktopBridge,
  modules: ['home', 'notes', 'ledger', 'settings']
}, null, 2));
