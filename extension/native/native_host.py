#!/usr/bin/env python3
"""Linux native-messaging launcher. Browser input cannot select executables."""
import fcntl
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import time
import urllib.request


def read_message(stream):
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ValueError('Incomplete message header')
    length = struct.unpack('=I', header)[0]
    if not 0 < length <= 65536:
        raise ValueError('Invalid message length')
    body = stream.read(length)
    if len(body) != length:
        raise ValueError('Incomplete message body')
    return json.loads(body)


def write_message(stream, message):
    body = json.dumps(message).encode('utf-8')
    stream.write(struct.pack('=I', len(body)) + body)
    stream.flush()


def is_ready(port):
    try:
        # Never route the loopback health check through a system HTTP proxy.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f'http://127.0.0.1:{port}/api/ai/status', timeout=0.5) as response:
            data = json.loads(response.read(65536))
            return data.get('status') == 'success' and isinstance(data.get('antigravity_available'), bool)
    except (OSError, ValueError, AttributeError):
        return False


def ensure_server(config):
    port = config['port']
    state = Path(config['state_dir'])
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / f'server-{port}.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if is_ready(port):
            return {'success': True, 'started': False}
        # Server.py otherwise selects another port when occupied. The extension
        # needs this exact port, so do not launch against a conflicting listener.
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(('127.0.0.1', port))
            except OSError as error:
                raise RuntimeError(f'Port {port} is occupied by a server that is not responding as LinguaPlay') from error
        server = Path(config['server_path'])
        if not server.is_file():
            raise RuntimeError(f'Server.py not found: {server}. Reinstall the local launcher with the correct --server path.')
        env = os.environ.copy()
        env['PATH'] = config['runtime_path']
        # Parser dependencies live beside the selected backend, outside system
        # Python. Preserve the venv symlink path so Python activates the venv.
        server_python = server.parent / '.venv/bin/python'
        python_path = str(server_python) if server_python.is_file() and os.access(server_python, os.X_OK) else config['python_path']
        with (state / 'server.log').open('ab') as log:
            process = subprocess.Popen(
                [python_path, '-u', str(server), '--host', '127.0.0.1', '--port', str(port)],
                cwd=server.parent, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                start_new_session=True, close_fds=True, env=env,
            )
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f'Server.py exited with status {process.returncode}; see {state / "server.log"}')
            if is_ready(port):
                return {'success': True, 'started': True, 'pid': process.pid}
            time.sleep(0.1)
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        raise RuntimeError(f'Server.py did not become ready; see {state / "server.log"}')


def main():
    try:
        config = json.loads(Path(__file__).with_name('config.json').read_text())
        origin = sys.argv[1].rstrip('/') + '/' if len(sys.argv) > 1 else ''
        if origin not in config['allowed_origins']:
            raise ValueError('This extension is not allowed to start the local server')
        message = read_message(sys.stdin.buffer)
        if message is None:
            return
        if not isinstance(message, dict) or set(message) != {'action', 'port'} or message.get('action') != 'ensure_server' or type(message.get('port')) is not int or message['port'] != config['port']:
            raise ValueError('Invalid startup request or port does not match the installed launcher')
        result = ensure_server(config)
    except Exception as error:
        result = {'success': False, 'error': str(error)}
    write_message(sys.stdout.buffer, result)


if __name__ == '__main__':
    main()
