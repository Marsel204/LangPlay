"""Malformed request framing must fail before consuming an unbounded body."""
import io
import json
import unittest
from unittest.mock import Mock, patch

import Server


class RequestValidationTests(unittest.TestCase):
    routes = {
        '/api/dictionary': 4096, '/api/translate': 65536,
        '/api/subtitles': 4096, '/api/subtitles/auto': 4096,
        '/api/parse': 65536, '/api/ai/chat': 1048576,
        '/api/ai/analyze': 1048576, '/api/bookmark': 1048576,
    }

    def handler(self, route, body=b'{}', length=None):
        handler = Server.RequestHandler.__new__(Server.RequestHandler)
        handler.path = route
        handler.headers = {'Content-Length': str(len(body)) if length is None else length}
        handler.rfile = Mock(wraps=io.BytesIO(body))
        handler.send_json_response = Mock()
        return handler

    def test_invalid_content_lengths_are_rejected_without_reading(self):
        for route, limit in self.routes.items():
            for length in ('-1', '0', 'invalid', str(limit + 1)):
                with self.subTest(route=route, length=length):
                    handler = self.handler(route, length=length)
                    handler.do_POST()
                    self.assertEqual(handler.send_json_response.call_args.args[0], 400)
                    handler.rfile.read.assert_not_called()

    def test_invalid_json_and_non_object_requests_are_client_errors(self):
        for route in self.routes:
            for body in (b'{', b'[]', b'null', b'"text"', b'\xff'):
                with self.subTest(route=route, body=body):
                    handler = self.handler(route, body)
                    handler.do_POST()
                    self.assertEqual(handler.send_json_response.call_args.args[0], 400)

    def test_incomplete_bodies_are_client_errors(self):
        for route in self.routes:
            with self.subTest(route=route):
                handler = self.handler(route, length='3')
                handler.do_POST()
                self.assertEqual(handler.send_json_response.call_args.args[0], 400)

    def test_non_text_fields_are_client_errors(self):
        for route in ('/api/ai/analyze', '/api/bookmark'):
            for value in (None, [], 42):
                with self.subTest(route=route, value=value):
                    handler = self.handler(route, json.dumps({'word': value}).encode())
                    handler.do_POST()
                    self.assertEqual(handler.send_json_response.call_args.args[0], 400)

    def test_analysis_cache_distinguishes_context_boundaries_and_readings(self):
        cases = (
            ({'word': '猫:犬', 'sentence': '鳥'}, {'word': '猫', 'sentence': '犬:鳥'}),
            ({'word': '生', 'sentence': '生です', 'romaji': 'nama'},
             {'word': '生', 'sentence': '生です', 'romaji': 'sei'}),
        )
        for first, second in cases:
            with self.subTest(first=first, second=second), patch.object(Server, 'ai_analysis_cache', {}), \
                    patch.object(Server, 'run_antigravity_analysis', side_effect=[{'context': 1}, {'context': 2}]) as analyze:
                for context in (first, second, second):
                    handler = self.handler('/api/ai/analyze', json.dumps({**context, 'provider': 'antigravity'}).encode())
                    handler.do_POST()
                    code, payload = handler.send_json_response.call_args.args
                    self.assertEqual(code, 200)
                    self.assertEqual(payload['data']['context'], 1 if context is first else 2)
                self.assertEqual(analyze.call_count, 2)


if __name__ == '__main__':
    unittest.main()
