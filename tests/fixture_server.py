"""Small local health server for launcher integration tests; never invokes AI."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--host', required=True)
parser.add_argument('--port', required=True, type=int)
args = parser.parse_args()
state = Path(__file__).parent
with (state / 'starts.log').open('a') as log:
    log.write(f'{os.getpid()}\n')


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'status': 'success', 'antigravity_available': False}).encode())

    def log_message(self, *_args):
        pass


ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
