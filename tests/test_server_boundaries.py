"""Exercise public assets, privileged origins, and stalled HTTP clients."""
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import socket
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

import Server


class ServerBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'static/js').mkdir(parents=True)
        (self.root / 'index.html').write_text('<p>Public app</p>')
        (self.root / 'static/js/app.js').write_text('console.log("public");')
        (self.root / '.env').write_text('PRIVATE=fixture')
        (self.root / 'anki_cards.txt').write_text('private card')
        (self.root / 'Server.py').write_text('# private source')
        (self.root / 'static/leak.js').symlink_to(self.root / '.env')
        self.paths = patch.multiple(Server, BASE_DIR=str(self.root), ANKI_FILE=str(self.root / 'anki_cards.txt'))
        self.paths.start()
        self.addCleanup(self.paths.stop)
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), Server.RequestHandler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()

    def request(self, path, body=None, origin=None, method=None):
        headers = {'Content-Type': 'text/plain'}
        if origin is not None:
            headers['Origin'] = origin
        request = urllib.request.Request(f'http://127.0.0.1:{self.http.server_port}{path}',
                                         None if body is None else json.dumps(body).encode(), headers, method=method)
        try:
            response = urllib.request.urlopen(request, timeout=2)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.code, response.read()

    def test_only_public_assets_are_served_for_get_and_head(self):
        for path in ('/', '/index.html', '/static/js/app.js'):
            for method in ('GET', 'HEAD'):
                self.assertEqual(self.request(path, method=method)[0], 200)
        for path in ('/.env', '/anki_cards.txt', '/Server.py', '/static/',
                     '/static/leak.js', '/static/../.env', '/static/%2e%2e/.env'):
            for method in ('GET', 'HEAD'):
                with self.subTest(path=path, method=method):
                    self.assertEqual(self.request(path, method=method)[0], 404)
        for path in ('/%00', '/static/a%00.js'):
            self.assertEqual(self.request(path)[0], 404)

    def test_untrusted_origins_cannot_run_ai_or_write_cards(self):
        original = (self.root / 'anki_cards.txt').read_bytes()
        with patch.object(Server, 'run_antigravity_chat', return_value='fixture') as chat, \
                patch.object(Server, 'run_antigravity_analysis', return_value={'fixture': True}) as analyze:
            routes = {
                '/api/ai/chat': {'messages': [{'role': 'user', 'content': 'question'}]},
                '/api/ai/analyze': {'word': '猫'}, '/api/bookmark': {'word': '猫'},
            }
            for path, body in routes.items():
                for origin in ('https://untrusted.example', 'null', 'http://['):
                    with self.subTest(path=path, origin=origin):
                        self.assertEqual(self.request(path, body, origin)[0], 403)
            chat.assert_not_called()
            analyze.assert_not_called()
        self.assertEqual((self.root / 'anki_cards.txt').read_bytes(), original)

    def test_existing_local_and_extension_callers_keep_ai_access(self):
        with patch.object(Server, 'run_antigravity_chat', return_value='fixture'):
            for origin in (None, 'http://127.0.0.1:43211', 'https://www.youtube.com', 'chrome-extension://fixture'):
                with self.subTest(origin=origin):
                    self.assertEqual(self.request('/api/ai/chat',
                        {'messages': [{'role': 'user', 'content': 'question'}]}, origin)[0], 200)

    def test_stalled_requests_release_a_bounded_worker(self):
        server_class = getattr(Server, 'LangPlayHTTPServer', None)
        self.assertIsNotNone(server_class, 'Production HTTP requests need a bounded worker pool.')
        entered = threading.Event()
        class Handler(Server.RequestHandler):
            def read_json_object(self, *args, **kwargs):
                entered.set()
                return super().read_json_object(*args, **kwargs)
        with patch.object(server_class, 'max_workers', 1), patch.object(Server.RequestHandler, 'request_timeout', .5):
            http = server_class(('127.0.0.1', 0), Handler)
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            try:
                with socket.create_connection(http.server_address, timeout=2) as stalled:
                    stalled.sendall(b'POST /api/parse HTTP/1.0\r\nContent-Length: 100\r\n\r\n{')
                    self.assertTrue(entered.wait(1), 'The first request must occupy the only worker.')
                    with socket.create_connection(http.server_address, timeout=2) as overflow:
                        self.assertIn(b'503', overflow.recv(4096))
                    self.assertIn(b'400', stalled.recv(4096))
                    while stalled.recv(4096):
                        pass
                with urllib.request.urlopen(f'http://127.0.0.1:{http.server_port}/', timeout=2) as response:
                    self.assertEqual(response.code, 200)
            finally:
                http.shutdown()
                http.server_close()
                thread.join()

    def test_slow_drip_headers_and_body_have_a_total_receive_deadline(self):
        with patch.object(Server.RequestHandler, 'request_timeout', .25):
            for initial in (b'GET / HTTP/1.0\r\nX-Drip: ', b'POST /api/parse HTTP/1.0\r\nContent-Length: 100\r\n\r\n'):
                with self.subTest(initial=initial), socket.create_connection(self.http.server_address, timeout=1) as client:
                    stop = threading.Event()
                    client.sendall(initial)
                    def drip():
                        while not stop.wait(.05):
                            try:
                                client.sendall(b'x')
                            except OSError:
                                break
                    feeder = threading.Thread(target=drip, daemon=True)
                    feeder.start()
                    try:
                        response = client.recv(4096)
                        self.assertTrue(b'400' in response or b'408' in response)
                    finally:
                        stop.set()
                        feeder.join(timeout=1)


if __name__ == '__main__':
    unittest.main()
