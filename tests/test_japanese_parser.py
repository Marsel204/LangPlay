"""Real morphology and real HTTP tests, without a translation/AI service."""
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
import json
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

import japanese_parser as parser
import Server as server


class JapaneseParserTests(unittest.TestCase):
    def test_readings_lemmas_and_clickable_inflections(self):
        cases = [
            ('学校', 'ガッコウ', '学校'), ('来ない', 'コナイ', '来る'),
            ('行った', 'イッタ', '行く'), ('上手く', 'ウマク', '上手い'),
            ('生ビール', 'ナマビール', '生ビール'),
            ('食べられなかった', 'タベラレナカッタ', '食べる'),
            ('泳ぎました', 'オヨギマシタ', '泳ぐ'),
        ]
        for surface, reading, lemma in cases:
            with self.subTest(surface=surface):
                tokens = parser.parse_japanese(surface)
                self.assertEqual(len(tokens), 1)
                self.assertEqual((tokens[0]['surface'], tokens[0]['reading'], tokens[0]['baseForm']), (surface, reading, lemma))
                self.assertEqual(''.join(m['surface'] for m in tokens[0]['morphemes']), surface)

    def test_utf16_offsets_whitespace_and_lossless_text(self):
        text = '😀 学校へ\n行った。'
        tokens = parser.parse_japanese(text)
        utf16 = text.encode('utf-16-le')
        self.assertEqual(''.join(t['surface'] for t in tokens), text)
        self.assertEqual(tokens[0]['end'], 2)
        offset = 0
        for token in tokens:
            self.assertEqual(token['start'], offset)
            self.assertEqual(utf16[token['start'] * 2:token['end'] * 2].decode('utf-16-le'), token['surface'])
            offset = token['end']
        self.assertEqual(offset, len(utf16) // 2)

    def test_cache_results_cannot_be_mutated_by_callers(self):
        tokens = parser.parse_japanese('来ない')
        tokens[0]['reading'] = 'wrong'
        tokens[0]['morphemes'][0]['baseForm'] = 'wrong'
        again = parser.parse_japanese('来ない')
        self.assertEqual(again[0]['reading'], 'コナイ')
        self.assertEqual(again[0]['morphemes'][0]['baseForm'], '来る')

    def test_parallel_requests_are_consistent(self):
        texts = ['学校へ行った。', '彼は来ない。', '食べられなかった'] * 12
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(parser.parse_japanese, texts))
        for text, tokens in zip(texts, results):
            self.assertEqual(tokens, parser.parse_japanese(text))

    def test_invalid_inputs(self):
        for value in [None, 1, {}, '', ' \n', '猫' * 4097]:
            with self.subTest(value=str(value)[:20]), self.assertRaises(ValueError):
                parser.parse_japanese(value)


class ParserHttpTests(unittest.TestCase):
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

    def request(self, payload):
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        request = urllib.request.Request(f'http://127.0.0.1:{self.http.server_port}/api/parse', data=data, headers={'Content-Type': 'application/json'})
        try:
            response = urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response), response.headers

    def test_live_route_and_cors(self):
        status, body, headers = self.request({'text': '来ない'})
        self.assertEqual(status, 200)
        self.assertEqual(body['engine'], 'sudachi')
        self.assertEqual(body['tokens'][0]['baseForm'], '来る')
        self.assertEqual(headers['Access-Control-Allow-Origin'], '*')

    def test_invalid_requests_do_not_run_parser(self):
        for payload in [b'{', b'\xff', b'', [], {}, {'text': 1}, {'text': '猫' * 4097}, b' ' * 65537]:
            with self.subTest(payload=str(payload)[:20]):
                self.assertEqual(self.request(payload)[0], 400)

    def test_missing_engine_returns_setup_error(self):
        with patch.object(server, 'parse_japanese', side_effect=parser.ParserUnavailable('Install requirements-parser.txt')):
            status, body, _ = self.request({'text': '猫'})
        self.assertEqual(status, 503)
        self.assertIn('requirements-parser.txt', body['message'])

    def test_parser_failure_does_not_leak_internal_exception(self):
        with patch.object(server, 'parse_japanese', side_effect=RuntimeError('internal details')):
            status, body, _ = self.request({'text': '猫'})
        self.assertEqual(status, 500)
        self.assertEqual(body['message'], 'Japanese parsing failed')


if __name__ == '__main__':
    unittest.main()
