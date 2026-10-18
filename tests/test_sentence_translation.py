"""Fast English must use translation transport and never the generative AI paths."""
from http.server import ThreadingHTTPServer
import http.client
import importlib.util
import io
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs

spec = importlib.util.spec_from_file_location('sentence_translation_server', Path(__file__).resolve().parents[1] / 'Server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class SentenceTranslationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.RequestHandler)
        cls.worker = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.worker.join()

    def request(self, body, origin=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.http.server_port, timeout=3)
        headers = {'Content-Type': 'application/json'}
        if origin: headers['Origin'] = origin
        conn.request('POST', '/api/translate', json.dumps(body), headers)
        response = conn.getresponse(); status = response.status; raw = response.read(); conn.close()
        return status, json.loads(raw)

    def test_combines_sentence_segments_and_reuses_cache_without_any_ai_call(self):
        data = [[['I can hear it.\n', '聞こえる。\n'], ['Even from far away.', '遠くからでも。']]]
        with patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(data).encode())) as send, \
                patch.object(server, 'run_deepseek_analysis', side_effect=AssertionError('AI must not run')), \
                patch.object(server, 'run_antigravity_analysis', side_effect=AssertionError('AI must not run')):
            status, result = self.request({'sentence': '聞こえる。\n遠くからでも。'})
            self.assertEqual(status, 200, result)
            self.assertEqual(result['translation'], 'I can hear it.\nEven from far away.')
            self.assertEqual(self.request({'sentence': '聞こえる。\n遠くからでも。'})[1], result)
        self.assertEqual(send.call_count, 1)
        query = parse_qs(urlparse(send.call_args.args[0].full_url).query)
        self.assertEqual(query['q'], ['聞こえる。\n遠くからでも。'])
        self.assertEqual(query['dt'], ['t'])
        self.assertEqual(query['sl'], ['ja']); self.assertEqual(query['tl'], ['en'])
        self.assertLessEqual(send.call_args.kwargs['timeout'], 6)

    def test_invalid_sentence_never_reaches_network(self):
        with patch.object(server.urllib.request, 'urlopen') as send:
            for body in [{}, [], {'sentence': ''}, {'sentence': 1}, {'sentence': 'あ' * 4097}]:
                self.assertEqual(self.request(body)[0], 400)
            send.assert_not_called()

    def test_failure_does_not_fall_back_to_ai_or_cache_an_error(self):
        with patch.object(server.urllib.request, 'urlopen', side_effect=TimeoutError('private details')), \
                patch.object(server, 'run_deepseek_analysis', side_effect=AssertionError('AI fallback forbidden')):
            status, result = self.request({'sentence': '今日は晴れ。'})
            self.assertEqual(status, 502, result)
            self.assertNotIn('private details', json.dumps(result))
        with patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps([[['It is sunny today.']]]).encode())):
            self.assertEqual(self.request({'sentence': '今日は晴れ。'})[1]['translation'], 'It is sunny today.')

    def test_oversized_or_invalid_replies_are_not_shown_as_english(self):
        for raw, sentence in [(b'not JSON', '赤い。'), (b'[]', '青い。'), (b'x' * 65537, '黄色い。')]:
            with patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(raw)):
                self.assertEqual(self.request({'sentence': sentence})[0], 502)

    def test_untrusted_origin_is_rejected(self):
        with patch.object(server.urllib.request, 'urlopen') as send:
            self.assertEqual(self.request({'sentence': '猫です。'}, 'https://example.com')[0], 403)
            send.assert_not_called()
