"""Bound malformed local requests and malformed remote subtitle responses."""
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import Server
import saved_subtitles
import subtitle_discovery


class AdversarialRuntimeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        guards = (
            patch.object(Server, 'find_agy_binary', return_value=str(Path(temporary.name) / 'no-ai-binary')),
            patch.object(Server, 'ANKI_FILE', str(Path(temporary.name) / 'cards.txt')),
            patch.dict(os.environ, {'LANGPLAY_SUBTITLE_DIR': str(Path(temporary.name) / 'subtitles'),
                                    'LANGPLAY_AI_PROVIDER': 'antigravity'}),
            patch.multiple(Server, run_antigravity_analysis=Mock(return_value={}),
                           run_antigravity_chat=Mock(return_value='fixture'),
                           run_deepseek_analysis=Mock(return_value={}), run_deepseek_chat=Mock(return_value='fixture'),
                           run_gemini_api_analysis=Mock(return_value={}), google_translate=Mock(return_value='fixture')),
        )
        for guard in guards:
            guard.start()
            self.addCleanup(guard.stop)

    def request(self, path, body):
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        handler = Server.RequestHandler.__new__(Server.RequestHandler)
        handler.path = path
        handler.headers = {'Content-Length': str(len(raw))}
        handler.rfile = io.BytesIO(raw)
        handler.send_json_response = Mock()
        handler.do_POST()
        return handler.send_json_response.call_args.args

    def test_deep_json_and_lone_surrogates_are_client_errors_on_all_post_routes(self):
        paths = ('/api/parse', '/api/dictionary', '/api/translate', '/api/subtitles',
                 '/api/subtitles/auto', '/api/ai/chat', '/api/ai/analyze', '/api/bookmark')
        with patch.object(Server, 'run_antigravity_analysis') as analysis:
            for path in paths:
                for raw in (b'[' * 1500 + b']' * 1500, b'{"word":"\\ud800"}'):
                    with self.subTest(path=path, raw=raw[:25]):
                        self.assertEqual(self.request(path, raw)[0], 400)
            analysis.assert_not_called()

    def test_non_string_provider_is_a_client_error_for_analysis(self):
        with patch.object(Server, 'run_antigravity_analysis', return_value={'meaning': 'fixture'}):
            for provider in ([], {}, 0, False, 3):
                with self.subTest(provider=provider):
                    self.assertEqual(self.request('/api/ai/analyze', {'word': '猫', 'provider': provider})[0], 400)

    def test_large_cli_prompts_are_rejected_before_process_creation(self):
        with patch.object(Server.subprocess, 'run', side_effect=AssertionError('Invalid prompt reached process creation.')) as run:
            with self.assertRaises(ValueError):
                Server.run_antigravity_prompt('猫' * 100000)
            run.assert_not_called()

    def test_bookmark_rows_cannot_become_comments_or_split_into_extra_rows(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(Server, 'ANKI_FILE', str(Path(folder) / 'cards.txt')):
            for sentence in ('#猫が好き', '猫\rが好き\u2028です'):
                self.assertEqual(self.request('/api/bookmark', {'word': '猫', 'sentence': sentence})[0], 200)
            lines = Path(Server.ANKI_FILE).read_text().splitlines()
            rows = [line for line in lines if not line.startswith('#')]
            self.assertEqual(len(rows), 2)
            self.assertTrue(all(len(row.split('\t')) == 4 for row in rows))
            self.assertIn('&#35;', rows[0])

    def test_windows_shift_jis_subtitles_include_cp932_extensions(self):
        text = '1\n00:00:01,000 --> 00:00:03,000\n①㈱髙 日本語\n'
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'LANGPLAY_SUBTITLE_DIR': folder}):
            Path(folder, 'windows.srt').write_bytes(text.encode('cp932'))
            self.assertEqual(saved_subtitles.saved_subtitles({'action': 'read', 'name': 'windows.srt', 'encoding': 'shift_jis'})['content'], text)
            self.assertEqual(subtitle_discovery._decode(text.encode('cp932'), '.srt'), text)

    @unittest.skipUnless(Path('/proc/self/fd').exists(), 'Linux descriptor accounting')
    def test_rejected_directories_do_not_leak_descriptors(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'LANGPLAY_SUBTITLE_DIR': folder}):
            Path(folder, 'directory.srt').mkdir()
            Path(folder, '.langplay-auto/1-1.json').mkdir(parents=True)
            before = len(os.listdir('/proc/self/fd'))
            for _ in range(10):
                with self.assertRaises((ValueError, OSError)):
                    saved_subtitles.saved_subtitles({'action': 'read', 'name': 'directory.srt'})
                self.assertIsNone(subtitle_discovery._cached(Path(folder), 1, 1))
            self.assertEqual(len(os.listdir('/proc/self/fd')), before)

    def test_malformed_provider_shapes_fail_with_actionable_errors(self):
        entry = {'id': 10, 'anilist_id': 1, 'flags': {'anime': True}}
        cases = ((None, []), ([{**entry, 'flags': None}], []), ([{**entry, 'flags': []}], []),
                 ([{**entry, 'flags': {'unverified': {}}}, {**entry, 'id': 11, 'flags': {'unverified': []}}], []),
                 ([entry], None), ([entry], [{'name': 'x.srt', 'size': 10, 'url': 5}]))
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'LANGPLAY_SUBTITLE_DIR': folder}):
            for entries, files in cases:
                with self.subTest(entries=entries, files=files), self.assertRaises(ValueError):
                    subtitle_discovery.automatic_subtitle({'mediaId': 1, 'episode': 1},
                        key_reader=lambda: 'fixture', get_json=lambda path, _key: entries if '/search?' in path else files,
                        download=lambda _url: self.fail('Malformed entries must not download.'))

    def test_deep_provider_json_and_credential_metadata_are_recoverable(self):
        deep = b'[' * 1500 + b']' * 1500
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {
            'LANGPLAY_SUBTITLE_DIR': folder, 'LANGPLAY_SEANIME_DIR': folder, 'LANGPLAY_JIMAKU_API_KEY': '',
        }):
            cache = Path(folder, '.langplay-auto/1-1.json')
            cache.parent.mkdir()
            cache.write_bytes(deep)
            self.assertIsNone(subtitle_discovery._cached(Path(folder), 1, 1))
            credential = Path(folder, 'cache/ext_user_config_subtitle-engine.cache')
            credential.parent.mkdir()
            for raw in (deep, b'{"subtitle-engine":{"value":{"values":null}}}'):
                credential.write_bytes(raw)
                self.assertEqual(subtitle_discovery.jimaku_key(), '')
            with patch.object(subtitle_discovery, '_fetch', return_value=deep), self.assertRaises(ValueError):
                subtitle_discovery.automatic_subtitle({'mediaId': 1, 'episode': 1}, key_reader=lambda: 'fixture')



    def test_jimaku_transport_failures_have_recoverable_http_errors(self):
        from contextlib import nullcontext
        import http.client
        import ssl
        failures = (http.client.BadStatusLine('bad status'), http.client.LineTooLong('headers'),
                    http.client.IncompleteRead(b'x', 3), ConnectionResetError('reset'), ssl.SSLError('TLS'))
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                response = Mock(url='https://jimaku.cc/api/entries/search', headers={},
                                read1=Mock(side_effect=failure))
                opener = Mock()
                opener.open.return_value = nullcontext(response)
                with patch.object(subtitle_discovery.urllib.request, 'build_opener', return_value=opener), \
                     patch.dict(os.environ, {'LANGPLAY_JIMAKU_API_KEY': 'fixture'}):
                    code, payload = self.request('/api/subtitles/auto', {'mediaId': 1, 'episode': 1})
                self.assertEqual(code, 400)
                self.assertIn('Jimaku', payload['message'])
                self.assertIn('Retry', payload['message'])
        response = Mock(url='https://jimaku.cc/api/entries/search', headers={'Content-Length': 'invalid'})
        opener = Mock()
        opener.open.return_value = nullcontext(response)
        with patch.object(subtitle_discovery.urllib.request, 'build_opener', return_value=opener), \
             patch.dict(os.environ, {'LANGPLAY_JIMAKU_API_KEY': 'fixture'}):
            code, payload = self.request('/api/subtitles/auto', {'mediaId': 1, 'episode': 1})
        self.assertEqual(code, 400)
        self.assertIn('Jimaku', payload['message'])
        self.assertNotIn('int()', payload['message'])

    def test_invalid_provider_filename_is_skipped_before_writes_and_valid_fallback_is_used(self):
        entry = {'id': 10, 'anilist_id': 1, 'flags': {'anime': True}}
        invalid = {'name': 'a\ud800.web.ja.srt', 'size': 32, 'url': 'https://jimaku.cc/entry/10/download/invalid'}
        valid = {'name': 'b.ja.srt', 'size': 32, 'url': 'https://jimaku.cc/entry/10/download/valid'}
        content = '1\n00:00:01,000 --> 00:00:03,000\n猫\n'
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'LANGPLAY_SUBTITLE_DIR': folder}):
            download = Mock(return_value=content.encode('utf-8'))
            for files in ([invalid], [invalid, valid]):
                provider = lambda path, _key: [entry] if '/search?' in path else files
                if len(files) == 1:
                    with self.assertRaises(ValueError):
                        subtitle_discovery.automatic_subtitle({'mediaId': 1, 'episode': 1},
                            key_reader=lambda: 'fixture', get_json=provider, download=download)
                    download.assert_not_called()
                    self.assertEqual(list(Path(folder).rglob('Jimaku.*')), [])
                else:
                    result = subtitle_discovery.automatic_subtitle({'mediaId': 1, 'episode': 1},
                        key_reader=lambda: 'fixture', get_json=provider, download=download)
                    self.assertEqual(result['originalName'], valid['name'])
                    self.assertEqual(result['content'], content)
                    download.assert_called_once_with(valid['url'])


if __name__ == '__main__':
    unittest.main()
