"""Sentence translation prefers Google and uses only configured 9Router on failure."""
from http.server import ThreadingHTTPServer
import http.client
import importlib.util
import io
import json
import os
import urllib.error
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

    def setUp(self):
        self.env = patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': ''})
        self.env.start(); self.addCleanup(self.env.stop)
        server.sentence_translation_cache.clear()
        server.sentence_fallback_cache.clear()
        server.google_retry_at = 0

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

    def test_google_failure_uses_configured_router_and_caches_the_sentence(self):
        with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': 'fixture/model'}), \
                patch.object(server.urllib.request, 'urlopen', side_effect=TimeoutError('private details')) as google, \
                patch.object(server, 'run_router_completion', return_value='Even if there were only a little time.') as router:
            status, result = self.request({'sentence': 'わずかな時間があったとしても'})
            self.assertEqual(status, 200, result)
            self.assertEqual(result['translation'], 'Even if there were only a little time.')
            self.assertEqual(self.request({'sentence': 'わずかな時間があったとしても'})[1], result)
            self.assertEqual(google.call_count, 1)
            self.assertEqual(router.call_count, 1)
            messages = router.call_args.args[0]
            self.assertEqual(messages[-1], {'role': 'user', 'content': 'わずかな時間があったとしても'})
            self.assertIn('only the translation', messages[0]['content'])
            self.assertLessEqual(router.call_args.kwargs['timeout'], 20)
            self.assertLessEqual(router.call_args.kwargs['max_tokens'], 2048)

    def test_google_success_never_uses_configured_router(self):
        with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': 'fixture/model'}), \
                patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(b'[[["A cat."]]]')), \
                patch.object(server, 'run_router_completion') as router:
            self.assertEqual(self.request({'sentence': '猫だ。'})[1]['translation'], 'A cat.')
            router.assert_not_called()

    def test_rate_limit_cooldown_skips_google_for_next_sentence_then_recovers(self):
        error = urllib.error.HTTPError('https://translate.googleapis.com', 429, 'limited', {}, None)
        with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': 'fixture/model'}), \
                patch.object(server.time, 'monotonic', return_value=100) as clock, \
                patch.object(server.urllib.request, 'urlopen', side_effect=error) as google, \
                patch.object(server, 'run_router_completion', return_value='English.'):
            self.assertEqual(self.request({'sentence': '一つ。'})[0], 200)
            self.assertEqual(self.request({'sentence': '二つ。'})[0], 200)
            self.assertEqual(google.call_count, 1)
            clock.return_value = 161
            google.side_effect = None; google.return_value = io.BytesIO(b'[[["Three."]]]')
            self.assertEqual(self.request({'sentence': '三つ。'})[1]['translation'], 'Three.')
            self.assertEqual(google.call_count, 2)

    def test_router_failure_is_safe_and_does_not_poison_cache(self):
        with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': 'fixture/model'}), \
                patch.object(server.urllib.request, 'urlopen', side_effect=TimeoutError()), \
                patch.object(server, 'run_router_completion', side_effect=RuntimeError('9Router unreachable.')) as router:
            status, result = self.request({'sentence': 'もう一度。'})
            self.assertEqual(status, 502)
            self.assertIn('9Router', result['message'])
            router.side_effect = None; router.return_value = 'Once more.'
            self.assertEqual(self.request({'sentence': 'もう一度。'})[1]['translation'], 'Once more.')
            self.assertEqual(router.call_count, 2)

    def test_router_cache_tracks_configured_model(self):
        with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': 'fixture/one'}), \
                patch.object(server.urllib.request, 'urlopen', side_effect=TimeoutError()), \
                patch.object(server, 'run_router_completion', side_effect=['Hello.', 'Hi.']) as router:
            self.assertEqual(self.request({'sentence': 'こんにちは。'})[1]['translation'], 'Hello.')
            with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': 'fixture/two'}):
                self.assertEqual(self.request({'sentence': 'こんにちは。'})[1]['translation'], 'Hi.')
            self.assertEqual(router.call_count, 2)

    def test_invalid_sentence_never_reaches_network(self):
        with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': 'fixture/model'}), \
                patch.object(server, 'run_router_completion') as router, \
                patch.object(server.urllib.request, 'urlopen') as send:
            for body in [{}, [], {'sentence': ''}, {'sentence': 1}, {'sentence': 'あ' * 4097}]:
                self.assertEqual(self.request(body)[0], 400)
            send.assert_not_called()
            router.assert_not_called()

    def test_unconfigured_failure_does_not_call_ai_or_cache_an_error(self):
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

    def test_invalid_router_results_are_not_cached(self):
        with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': 'fixture/model'}), \
                patch.object(server.urllib.request, 'urlopen', side_effect=TimeoutError()), \
                patch.object(server, 'run_router_completion') as router:
            for reply in ['', None, 'x' * 8001]:
                router.return_value = reply
                self.assertEqual(self.request({'sentence': '字幕。'})[0], 502)
            router.return_value = 'Subtitles.'
            self.assertEqual(self.request({'sentence': '字幕。'})[1]['translation'], 'Subtitles.')

    def test_dictionary_failure_never_uses_router(self):
        with patch.dict(os.environ, {'LANGPLAY_9ROUTER_MODEL': 'fixture/model'}), \
                patch.object(server.urllib.request, 'urlopen', side_effect=TimeoutError()), \
                patch.object(server, 'run_router_completion') as router:
            with self.assertRaises(LookupError):
                server.lookup_google_word('未登録')
            router.assert_not_called()

    def test_untrusted_origin_is_rejected(self):
        with patch.object(server.urllib.request, 'urlopen') as send:
            self.assertEqual(self.request({'sentence': '猫です。'}, 'https://example.com')[0], 403)
            send.assert_not_called()
