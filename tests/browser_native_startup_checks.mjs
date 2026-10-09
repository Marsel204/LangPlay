// Verify the real extension worker talks to an isolated installed native host.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function checkNativeStartup({ root, profile, extensionOrigin, evaluate }) {
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const fixture = path.join(profile, 'Server.py');
  await copyFile(path.join(root, 'tests/fixture_server.py'), fixture);
  await promisify(execFile)(process.env.PYTHON_PATH || 'python3', [path.join(root, 'native/install_host.py'), '--server', fixture, '--extension-id', new URL(extensionOrigin).hostname, '--port', String(port), '--install-dir', path.join(profile, 'native'), '--state-dir', path.join(profile, 'native-state'), '--user-data-dir', profile]);
  try {
    await evaluate(`chrome.storage.local.set({linguaplay_server_url:'http://127.0.0.1:${port}',linguaplay_auto_start_server:true})`);
    const results = await evaluate(`Promise.all(Array.from({length:6}, () => chrome.runtime.sendMessage({action:'ENSURE_LOCAL_SERVER'})))`);
    assert.ok(results.every(result => result.success && result.started), JSON.stringify(results));
    assert.equal((await readFile(path.join(profile, 'starts.log'), 'utf8')).trim().split('\n').length, 1);
    const reused = await evaluate(`chrome.runtime.sendMessage({action:'ENSURE_LOCAL_SERVER'})`);
    assert.equal(reused.started, false);
    assert.equal(reused.success, true);
    const health = await fetch(`http://127.0.0.1:${port}/api/ai/status`).then(response => response.json());
    assert.equal(health.status, 'success');
    await evaluate(`chrome.storage.local.set({linguaplay_auto_start_server:false})`);
    assert.equal((await evaluate(`chrome.runtime.sendMessage({action:'ENSURE_LOCAL_SERVER'})`)).skipped, true);
    return { nativeHostConnected: true, concurrentLaunches: 1, runningServerReused: true, optOut: true };
  } finally {
    // Only processes started by this isolated fixture are stopped.
    const pids = await readFile(path.join(profile, 'starts.log'), 'utf8').catch(() => '');
    for (const pid of pids.trim().split('\n').filter(Boolean)) {
      try { process.kill(Number(pid), 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await evaluate(`chrome.storage.local.set({linguaplay_server_url:'http://127.0.0.1:8000',linguaplay_auto_start_server:false})`);
  }
}
