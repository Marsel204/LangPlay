"""Real process/protocol tests, isolated from user profiles and server files."""
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
EXT_ROOT = ROOT / 'extension' if (ROOT / 'extension/manifest.json').exists() else ROOT
spec = importlib.util.spec_from_file_location('native_host', EXT_ROOT / 'native/native_host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)
EXTENSION = 'abcdefghijklmnopabcdefghijklmnop'


class NativeHostTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.server = self.directory / 'Server.py'
        shutil.copyfile(ROOT / 'tests/fixture_server.py', self.server)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        subprocess.run([sys.executable, str(EXT_ROOT / 'native/install_host.py'), '--server', str(self.server), '--extension-id', EXTENSION, '--port', str(self.port), '--install-dir', str(self.directory / 'native'), '--state-dir', str(self.directory / 'state'), '--user-data-dir', str(self.directory / 'browser')], check=True, stdout=subprocess.DEVNULL)

    def tearDown(self):
        starts = self.directory / 'starts.log'
        if starts.exists():
            for pid in starts.read_text().splitlines():
                try:
                    os.kill(int(pid), signal.SIGTERM)
                except ProcessLookupError:
                    pass
        self.temp.cleanup()

    def request(self, message=None, origin=f'chrome-extension://{EXTENSION}/'):
        data = io.BytesIO()
        host.write_message(data, message or {'action': 'ensure_server', 'port': self.port})
        result = subprocess.run([str(self.directory / 'native/launch-server'), origin], input=data.getvalue(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15, check=True)
        self.assertEqual(result.stderr, b'')
        return host.read_message(io.BytesIO(result.stdout))

    def test_simultaneous_launches_and_reuse(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            answers = list(pool.map(lambda _: self.request(), range(4)))
        self.assertTrue(all(answer['success'] for answer in answers))
        self.assertEqual(sum(answer['started'] for answer in answers), 1)
        self.assertEqual(len((self.directory / 'starts.log').read_text().splitlines()), 1)
        self.assertFalse(self.request()['started'])

    def test_origin_port_and_command_validation(self):
        self.assertFalse(self.request(origin='chrome-extension://other/')['success'])
        for message in [{'action': 'ensure_server', 'port': self.port + 1}, {'action': 'ensure_server', 'port': self.port, 'command': 'other'}, {'action': 'ensure_server', 'port': True}]:
            self.assertFalse(self.request(message)['success'])
        self.assertFalse((self.directory / 'starts.log').exists())

    def test_prefers_server_virtual_environment(self):
        venv = self.directory / '.venv'
        subprocess.run([sys.executable, '-m', 'venv', '--without-pip', str(venv)], check=True)
        self.server.write_text('import sys\nfrom pathlib import Path\nPath(__file__).with_name("prefix.txt").write_text(sys.prefix)\n' + self.server.read_text())
        answer = self.request()
        self.assertTrue(answer['success'], answer)
        self.assertEqual((self.directory / 'prefix.txt').read_text(), str(venv))

    def test_restart_after_server_stops(self):
        first = self.request()
        os.kill(first['pid'], signal.SIGTERM)
        deadline = time.monotonic() + 2
        while host.is_ready(self.port) and time.monotonic() < deadline:
            time.sleep(0.05)
        second = self.request()
        self.assertTrue(second['success'], second)
        self.assertTrue(second['started'])
        self.assertNotEqual(first['pid'], second['pid'])

    def test_occupied_port_does_not_start_another_server(self):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', self.port))
            sock.listen()
            result = self.request()
        self.assertFalse(result['success'])
        self.assertIn('occupied', result['error'])
        self.assertFalse((self.directory / 'starts.log').exists())

    def test_missing_or_crashing_server_reports_log(self):
        self.server.unlink()
        self.assertIn('not found', self.request()['error'])
        self.server.write_text('raise RuntimeError("test startup failure")\n')
        self.assertIn('exited', self.request()['error'])
        self.assertIn('test startup failure', (self.directory / 'state/server.log').read_text())

    def test_protocol_rejects_bad_frames_and_handles_unicode(self):
        for frame in [b'x', struct.pack('=I', 65537), struct.pack('=I', 5) + b'{}', struct.pack('=I', 1) + b'x']:
            with self.assertRaises(ValueError):
                host.read_message(io.BytesIO(frame))
        data = io.BytesIO()
        host.write_message(data, {'error': '日本語'})
        self.assertEqual(host.read_message(io.BytesIO(data.getvalue())), {'error': '日本語'})


if __name__ == '__main__':
    unittest.main()
