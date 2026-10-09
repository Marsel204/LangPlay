"""Exercise the real chat HTTP route with a controlled Antigravity process."""
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import subprocess
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('chat_server', Path(__file__).resolve().parents[1] / 'Server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class ChatTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.RequestHandler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def request(self, body):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        request = urllib.request.Request(f'http://127.0.0.1:{self.http.server_port}/api/ai/chat', data=data, headers={'Content-Type': 'application/json'})
        try:
            response = urllib.request.urlopen(request, timeout=3)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.code, json.load(response), response.headers

    def test_markdown_reply_uses_context_and_ordered_conversation(self):
        messages = [
            {'role': 'system', 'content': 'Explain Japanese simply'},
            {'role': 'user', 'content': 'First question'},
            {'role': 'assistant', 'content': 'First answer'},
            {'role': 'user', 'content': 'Follow-up question'},
        ]
        reply = '**Answer**\n\n| Word | Meaning |\n| --- | --- |\n| 猫 | cat |'
        with patch.object(server, 'find_agy_binary', return_value='/test/agy'), patch.object(server.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=reply, stderr='')) as run:
            code, data, headers = self.request({'messages': messages, 'word': '猫', 'sentence': '猫がいる', 'romaji': 'neko'})
        self.assertEqual(code, 200)
        self.assertEqual(data, {'status': 'success', 'reply': reply})
        self.assertEqual(headers['Access-Control-Allow-Origin'], '*')
        command = run.call_args.args[0]
        self.assertEqual(command[:2], ['/test/agy', '--print'])
        prompt = command[2]
        positions = [prompt.index(message['content']) for message in messages]
        self.assertEqual(positions, sorted(positions))
        self.assertIn('猫がいる', prompt)
        self.assertIn('neko', prompt)

    def test_invalid_chat_input_does_not_run_cli(self):
        invalid = [b'{', [], {}, {'messages': []}, {'messages': [{'role': 'tool', 'content': 'x'}]}, {'messages': [{'role': 'user', 'content': 12}]}, {'messages': [{'role': 'assistant', 'content': 'x'}]}, {'messages': [{'role': 'user', 'content': 'x'}], 'sentence': 42}]
        with patch.object(server.subprocess, 'run') as run:
            for body in invalid:
                with self.subTest(body=body):
                    code, data, _ = self.request(body)
                    self.assertEqual(code, 400)
                    self.assertEqual(data['status'], 'error')
            run.assert_not_called()

    def test_cli_timeout_and_failure_are_reported(self):
        body = {'messages': [{'role': 'user', 'content': 'Explain は'}]}
        with patch.object(server, 'find_agy_binary', return_value='/test/agy'):
            with patch.object(server.subprocess, 'run', side_effect=subprocess.TimeoutExpired('agy', 90)):
                code, data, _ = self.request(body)
                self.assertEqual(code, 504)
                self.assertIn('90 seconds', data['message'])
            for result in [subprocess.CompletedProcess([], 1, stdout='', stderr='CLI failed'), subprocess.CompletedProcess([], 0, stdout='', stderr='')]:
                with patch.object(server.subprocess, 'run', return_value=result):
                    code, data, _ = self.request(body)
                    self.assertEqual(code, 500)
                    self.assertTrue(data['message'])

    def test_analyze_supports_custom_prompt_for_song_identification(self):
        song_prompt = 'Extract the song metadata:\nTitle: "Oregairu S2 OP - Harumodoki"\nRespond in JSON only: {"trackName": "...", "artistName": "...", "animeName": "..."}'
        ai_reply = '```json\n{"trackName": "春擬き", "artistName": "やなぎなぎ", "animeName": "やはり俺の青春ラブコメはまちがっている。続"}\n```'
        payload = json.dumps({
            'word': 'Oregairu S2 OP - Harumodoki',
            'sentence': 'Oregairu S2 OP - Harumodoki',
            'romaji': '',
            'prompt': song_prompt,
            'provider': 'antigravity',
        }).encode()
        req = urllib.request.Request(
            f'http://127.0.0.1:{self.http.server_port}/api/ai/analyze',
            data=payload,
            headers={'Content-Type': 'application/json'},
        )
        with patch.object(server, 'find_agy_binary', return_value='/test/agy'), patch.object(
            server.subprocess,
            'run',
            return_value=subprocess.CompletedProcess([], 0, stdout=ai_reply, stderr=''),
        ) as run:
            with urllib.request.urlopen(req, timeout=3) as resp:
                code = resp.code
                data = json.load(resp)
        self.assertEqual(code, 200)
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['data']['trackName'], '春擬き')
        self.assertEqual(data['data']['artistName'], 'やなぎなぎ')
        command = run.call_args.args[0]
        self.assertEqual(command[2], song_prompt)


if __name__ == '__main__':
    unittest.main()

