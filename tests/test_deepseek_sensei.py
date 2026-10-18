"""Verify Sensei's real HTTP routes with a fake DeepSeek transport, never real keys."""
from http.server import ThreadingHTTPServer
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('deepseek_server', Path(__file__).resolve().parents[1] / 'Server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class DeepSeekTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.RequestHandler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.thread.join()

    def setUp(self):
        server.ai_analysis_cache.clear()
        for name, result in [('run_antigravity_chat','legacy fixture'),('run_antigravity_analysis',{'legacy':True})]:
            guard=patch.object(server,name,return_value=result)
            guard.start(); self.addCleanup(guard.stop)
        self.env = patch.dict(os.environ, {'LANGPLAY_AI_PROVIDER':'deepseek', 'LANGPLAY_DEEPSEEK_API_KEY':'test-private-key'})
        self.env.start(); self.addCleanup(self.env.stop)

    def request(self, route, body=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.http.server_port, timeout=3)
        connection.request('POST' if body is not None else 'GET', route,
                           json.dumps(body) if body is not None else None, {'Content-Type':'application/json'})
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def completion(self, content, reason='stop'):
        return io.BytesIO(json.dumps({'choices':[{'message':{'content':content},'finish_reason':reason}]}).encode())

    def test_explain_uses_configured_deepseek_without_exposing_key(self):
        result = {'contextual_meaning':'cat', 'romaji':'neko', 'word_by_word':[{'word':'猫','romaji':'neko','meaning':'cat'}]}
        with patch.object(server.urllib.request, 'urlopen', return_value=self.completion(json.dumps(result))) as send:
            status, data = self.request('/api/ai/analyze', {'word':'猫','sentence':'猫がいる','romaji':'neko'})
        self.assertEqual(status, 200, data)
        self.assertEqual(data['data'], result)
        self.assertEqual(data['provider'], 'deepseek')
        request = send.call_args.args[0]
        self.assertEqual(request.full_url, 'https://api.deepseek.com/chat/completions')
        self.assertEqual(request.get_header('Authorization'), 'Bearer test-private-key')
        payload = json.loads(request.data)
        self.assertEqual(payload['model'], 'deepseek-flash')
        self.assertEqual(payload['response_format'], {'type':'json_object'})
        self.assertEqual(payload['thinking'], {'type':'disabled'})
        self.assertNotIn('test-private-key', json.dumps(payload)+json.dumps(data))

    def test_ask_preserves_context_and_followup_order(self):
        messages = [{'role':'user','content':'Why ga?'},{'role':'assistant','content':'It marks the subject.'},
                    {'role':'user','content':'And iru?'}]
        with patch.object(server.urllib.request, 'urlopen', return_value=self.completion('**Iru** means to exist.')) as send:
            status, data = self.request('/api/ai/chat', {'messages':messages,'word':'猫','sentence':'猫がいる','romaji':'neko'})
        self.assertEqual(status, 200, data)
        self.assertEqual(data['reply'], '**Iru** means to exist.')
        payload = json.loads(send.call_args.args[0].data)
        self.assertEqual(payload['messages'][1:], messages)
        self.assertIn('猫がいる', payload['messages'][0]['content'])
        self.assertIn('neko', payload['messages'][0]['content'])

    def test_status_reports_configuration_without_credentials(self):
        status, data = self.request('/api/ai/status')
        self.assertEqual(status,200)
        self.assertEqual(data['default_provider'],'deepseek')
        self.assertTrue(data['deepseek_configured'])
        self.assertNotIn('test-private-key', json.dumps(data))

    def test_missing_key_fails_without_network_or_cli(self):
        with patch.dict(os.environ,{'LANGPLAY_DEEPSEEK_API_KEY':''}), patch.object(server.urllib.request,'urlopen') as send, patch.object(server,'run_antigravity_chat') as cli:
            status,data = self.request('/api/ai/chat',{'messages':[{'role':'user','content':'Explain 猫'}]})
        self.assertNotEqual(status,200)
        self.assertIn('DeepSeek API key',data['message'])
        send.assert_not_called(); cli.assert_not_called()

    def test_rejected_key_is_actionable_and_never_echoed(self):
        error = urllib.error.HTTPError('https://api.deepseek.com/chat/completions',401,'Unauthorized',{},
                                      io.BytesIO(b'{"error":{"message":"test-private-key"}}'))
        with patch.object(server.urllib.request,'urlopen',side_effect=error):
            status,data = self.request('/api/ai/chat',{'messages':[{'role':'user','content':'Explain 猫'}]})
        self.assertNotEqual(status,200)
        self.assertIn('401',data['message'])
        self.assertNotIn('test-private-key',json.dumps(data))

    def test_truncated_reply_is_not_presented_as_success(self):
        with patch.object(server.urllib.request,'urlopen',return_value=self.completion('partial','length')):
            status,data = self.request('/api/ai/chat',{'messages':[{'role':'user','content':'Explain 猫'}]})
        self.assertNotEqual(status,200)
        self.assertIn('incomplete',data['message'].lower())


if __name__ == '__main__': unittest.main()
