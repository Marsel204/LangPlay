"""9Router contract: fake transports only; no CLI or external AI execution."""
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('router_server', Path(__file__).resolve().parents[1] / 'Server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class RouterTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': '  oc/exact-model  ', 'LANGPLAY_9ROUTER_API_KEY': 'fake-secret'}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_config_normalization_and_exact_model(self):
        for url in ['', 'http://127.0.0.1:20128/', 'http://127.0.0.1:20128/v1/', 'http://127.0.0.1:20128/v1/chat/completions/']:
            with patch.dict(os.environ, {'LANGPLAY_9ROUTER_BASE_URL': url}):
                base, key, model = server.router_config()
                self.assertEqual(base, 'http://127.0.0.1:20128/v1')
                self.assertEqual(model, 'oc/exact-model')
                self.assertEqual(key, 'fake-secret')

    def test_invalid_configuration(self):
        for url in ['file:///tmp/key', 'https://user:fake-secret@host/v1', 'http://host/v1?key=fake-secret', 'http://host/#fake-secret']:
            with patch.dict(os.environ, {'LANGPLAY_9ROUTER_BASE_URL': url}):
                with self.assertRaisesRegex(ValueError, '9Router'):
                    server.router_config()
        with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': ' '}):
            with self.assertRaisesRegex(ValueError, 'MODEL'):
                server.router_config()

    def test_completion_contract(self):
        response = io.BytesIO(json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': '{"meaning":"cat"}'}}]}).encode())
        with patch.object(server.urllib.request.OpenerDirector, 'open', return_value=response) as transport:
            result = server.run_router_completion([{'role': 'user', 'content': '猫'}], json_output=True)
        self.assertEqual(json.loads(result), {'meaning': 'cat'})
        request = transport.call_args.args[0]
        self.assertEqual(request.full_url, 'http://127.0.0.1:20128/v1/chat/completions')
        self.assertEqual(request.get_header('Authorization'), 'Bearer fake-secret')
        body = json.loads(request.data)
        self.assertEqual(body['model'], 'oc/exact-model')
        self.assertEqual(body['stream'], False)
        self.assertEqual(body['response_format'], {'type': 'json_object'})

    def test_optional_token_redirect_and_response_limit(self):
        with patch.dict(os.environ, {'LANGPLAY_9ROUTER_API_KEY':''}), patch.object(server.urllib.request.OpenerDirector, 'open', return_value=io.BytesIO(b'{"choices":[{"finish_reason":"stop","message":{"content":"OK"}}]}')) as transport:
            self.assertEqual(server.run_router_completion([]), 'OK')
            self.assertIsNone(transport.call_args.args[0].get_header('Authorization'))
        with self.assertRaisesRegex(RuntimeError, 'redirect rejected'):
            server.RouterNoRedirect().redirect_request(None, None, 302, 'fake-secret', {}, 'http://other-host/')
        for raw in [b'x' * (2 * 1024 * 1024 + 1), b'invalid json fake-secret']:
            with patch.object(server.urllib.request.OpenerDirector, 'open', return_value=io.BytesIO(raw)):
                with self.assertRaises(RuntimeError) as error:
                    server.run_router_completion([])
                self.assertNotIn('fake-secret', str(error.exception))

    def test_bad_responses_are_sanitized(self):
        for data in [[], {}, {'choices': [None]}, {'choices': [{'finish_reason': 'length', 'message': {'content': 'fake-secret'}}]}, {'choices': [{'finish_reason': 'stop', 'message': {'content': ''}}]}]:
            with patch.object(server.urllib.request.OpenerDirector, 'open', return_value=io.BytesIO(json.dumps(data).encode())):
                with self.assertRaises(RuntimeError) as error:
                    server.run_router_completion([])
                self.assertNotIn('fake-secret', str(error.exception))

if __name__ == '__main__':
    unittest.main()

class RouterHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from http.server import ThreadingHTTPServer
        import threading
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.RequestHandler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.thread.join()

    def setUp(self):
        server.ai_analysis_cache.clear()
        guard = patch.dict(os.environ, {'LANGPLAY_AI_PROVIDER':'9router', 'LANGPLAY_9ROUTER_MODEL':'oc/exact', 'LANGPLAY_9ROUTER_BASE_URL':'http://127.0.0.1:20128/v1', 'LANGPLAY_9ROUTER_API_KEY':'fake-secret'})
        guard.start(); self.addCleanup(guard.stop)
        for name in ['run_antigravity_chat','run_antigravity_analysis','run_deepseek_chat','run_deepseek_analysis']:
            guard = patch.object(server, name, side_effect=AssertionError('Forbidden fallback'))
            guard.start(); self.addCleanup(guard.stop)

    def request(self, path, body=None):
        import http.client
        connection = http.client.HTTPConnection('127.0.0.1', self.http.server_port, timeout=3)
        connection.request('POST' if body is not None else 'GET', path, body=json.dumps(body) if body is not None else None, headers={'Content-Type':'application/json'})
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def completion(self, content='{"meaning":"cat"}'):
        return io.BytesIO(json.dumps({'choices':[{'finish_reason':'stop','message':{'content':content}}]}).encode())

    def test_http_analysis_cache_isolation_and_validation(self):
        body = {'word':'猫','sentence':'猫がいる','provider':'9router'}
        with patch.object(server.urllib.request.OpenerDirector, 'open', side_effect=lambda *a, **k:self.completion()) as transport:
            self.assertEqual(self.request('/api/ai/analyze', body)[0], 200)
            self.assertTrue(self.request('/api/ai/analyze', body)[1]['cached'])
            for name, value in [('LANGPLAY_9ROUTER_MODEL','combo'),('LANGPLAY_9ROUTER_API_KEY','other-fake'),('LANGPLAY_9ROUTER_BASE_URL','http://localhost:20128/v1')]:
                with patch.dict(os.environ, {name:value}):
                    self.assertEqual(self.request('/api/ai/analyze', body)[0], 200)
            self.assertEqual(transport.call_count, 4)
            with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL':''}):
                status, result = self.request('/api/ai/analyze', body)
                self.assertNotEqual(status, 200)
                self.assertIn('MODEL', result['message'])
            self.assertEqual(transport.call_count, 4)

    def test_http_context_chat_and_status(self):
        messages = [{'role':'user','content':'first'},{'role':'assistant','content':'answer'},{'role':'user','content':'next'}]
        with patch.object(server.urllib.request.OpenerDirector, 'open', return_value=self.completion('Tutor reply')) as transport:
            status, data = self.request('/api/ai/chat', {'messages':messages,'word':'猫','sentence':'猫がいる'})
        self.assertEqual((status,data['reply']), (200,'Tutor reply'))
        payload = json.loads(transport.call_args.args[0].data)
        self.assertEqual(payload['messages'][1:], messages)
        self.assertIn('猫がいる', payload['messages'][0]['content'])
        status, data = self.request('/api/ai/status')
        self.assertTrue(data['router_configured'])
        self.assertNotIn('fake-secret', json.dumps(data))
        self.assertNotIn('connected', json.dumps(data))

    def test_http_failures_sanitized_without_fallback(self):
        import urllib.error
        for failure in [urllib.error.HTTPError('http://fake', code, 'fake-secret', {}, io.BytesIO(b'fake-secret')) for code in [401,403,429]] + [urllib.error.URLError('fake-secret'), TimeoutError('fake-secret')]:
            with patch.object(server.urllib.request.OpenerDirector, 'open', side_effect=failure):
                status, data = self.request('/api/ai/chat', {'provider':'9router','messages':[{'role':'user','content':'Hi'}]})
            self.assertNotEqual(status, 200)
            self.assertNotIn('fake-secret', json.dumps(data))

    def test_protocol_errors_sanitized_in_both_routes_and_logs(self):
        import http.client
        for path, body in [('/api/ai/analyze', {'word':'猫','provider':'9router'}), ('/api/ai/chat', {'provider':'9router','messages':[{'role':'user','content':'Hi'}]})]:
            for failure in [http.client.BadStatusLine('review-fake-token'), http.client.IncompleteRead(b'review-fake-token', 99)]:
                with patch.object(server.urllib.request.OpenerDirector, 'open', side_effect=failure), patch('sys.stdout', new_callable=io.StringIO) as logs:
                    status, data = self.request(path, body)
                self.assertNotEqual(status, 200)
                self.assertNotIn('review-fake-token', json.dumps(data) + logs.getvalue())
                self.assertIn('9Router', data['message'])
