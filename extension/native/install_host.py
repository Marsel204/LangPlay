#!/usr/bin/env python3
"""Register the LinguaPlay launcher for explicitly selected Linux extensions."""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys

HOST_NAME = 'com.linguaplay.server'


def main():
    parser = argparse.ArgumentParser(description='Install LinguaPlay video-playback server launcher (Linux)')
    parser.add_argument('--server', type=Path, required=True, help='Absolute path to the existing LangPlay Server.py')
    parser.add_argument('--extension-id', action='append', required=True, help='Extension ID from chrome://extensions; repeat to allow more than one checkout')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--install-dir', type=Path, default=Path.home() / '.local/share/linguaplay/native')
    parser.add_argument('--state-dir', type=Path, default=Path.home() / '.local/state/linguaplay')
    parser.add_argument('--user-data-dir', action='append', type=Path, help='Register only in these Chrome/Chromium data directories; defaults to both browsers')
    args = parser.parse_args()
    if not sys.platform.startswith('linux'):
        parser.error('This launcher installer currently supports Linux')
    if not args.server.is_file():
        parser.error('Server.py must exist at --server')
    if not 1 <= args.port <= 65535 or any(not re.fullmatch('[a-p]{32}', value) for value in args.extension_id):
        parser.error('Use a valid port and 32-letter Chrome extension IDs')
    install_dir = args.install_dir.expanduser().resolve()
    install_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    allowed = [f'chrome-extension://{value}/' for value in sorted(set(args.extension_id))]
    config = {
        'server_path': str(args.server.resolve()), 'python_path': sys.executable,
        'port': args.port, 'allowed_origins': allowed,
        'state_dir': str(args.state_dir.expanduser().resolve()), 'runtime_path': os.environ.get('PATH', os.defpath),
    }
    config_path = install_dir / 'config.json'
    config_path.write_text(json.dumps(config, indent=2) + '\n')
    config_path.chmod(0o600)
    shutil.copyfile(Path(__file__).with_name('native_host.py'), install_dir / 'native_host.py')
    wrapper = install_dir / 'launch-server'
    wrapper.write_text(f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(install_dir / "native_host.py"))} "$@"\n')
    wrapper.chmod(0o700)
    manifest = {'name': HOST_NAME, 'description': 'Start the local LinguaPlay server on video playback', 'path': str(wrapper), 'type': 'stdio', 'allowed_origins': allowed}
    directories = args.user_data_dir or [Path.home() / '.config/google-chrome', Path.home() / '.config/chromium']
    for directory in directories:
        hosts = directory.expanduser().resolve() / 'NativeMessagingHosts'
        hosts.mkdir(parents=True, exist_ok=True)
        target = hosts / f'{HOST_NAME}.json'
        target.write_text(json.dumps(manifest, indent=2) + '\n')
        print(f'Registered: {target}')
    print(f'Server: {config["server_path"]} on 127.0.0.1:{args.port}')
    print('Reload the extension. Playing a video will start the server when needed.')


if __name__ == '__main__':
    main()
