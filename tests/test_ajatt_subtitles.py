"""Offline AJATT matching, provider fallback, transport policy, and cache checks."""
from contextlib import nullcontext
from html import escape
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.parse
import urllib.request

import ajatt_subtitles as ajatt
import subtitle_discovery as discovery

TEXT = '1\n00:00:01,000 --> 00:00:03,000\n日本語です。\n'
TITLE = 'Generated Show 4th Season'
PAGE = 'https://subtitles.ajatt.top/anime_tv/generated-show-4th-season.html'
FOLDER = 'https://raw.githubusercontent.com/Ajatt-Tools/kitsunekko-mirror/refs/heads/main/subtitles/anime_tv/Generated%20Show%204th%20Season'
NAME = 'Show.S04E02.WEBRip.Amazon.ja.srt'
CATALOG = f'''<table><tbody><tr data-entry-type="anime_tv">
<td class="entry_name"><a href="anime_tv/generated-show-4th-season.html">{TITLE}</a></td>
<td class="english_name">Generated Show Season 4</td><td class="japanese_name">テスト 第4期</td>
</tr></tbody></table>'''.encode()


def file_row(name=NAME, *, size=100, url=None):
    url = url or FOLDER + '/' + urllib.parse.quote(name)
    return f'<tr data-file-size="{size}"><td class="entry_name"><a href="{escape(url, quote=True)}" download="{escape(name, quote=True)}">{escape(name)}</a></td></tr>'


class AjattTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        environment = patch.dict(os.environ, {'LANGPLAY_SUBTITLE_DIR': self.temp.name})
        environment.start()
        self.addCleanup(environment.stop)
        catalog = patch.object(ajatt, '_catalog', (0, ()))
        catalog.start()
        self.addCleanup(catalog.stop)
        self.requests = []
        self.page = '<table><tbody>' + file_row() + '</tbody></table>'
        self.metadata = {'anilist_id': 189046, 'entry_type': 'anime_tv'}
        self.catalog = CATALOG
        self.contents = {}

    def mirror(self, url, limit):
        self.requests.append(url)
        if url == ajatt.CATALOG_URL:
            data = self.catalog
        elif url == PAGE:
            data = self.page.encode()
        elif url == FOLDER + '/.kitsuinfo.json':
            data = json.dumps(self.metadata).encode()
        elif url.startswith(FOLDER + '/'):
            name = urllib.parse.unquote(url.rsplit('/', 1)[-1])
            data = self.contents.get(name, TEXT.encode())
        else:
            self.fail(f'Unexpected provider request: {url}')
        self.assertLessEqual(len(data), limit)
        return data

    def fetch(self, *, title=TITLE, key='', get_json=None):
        return discovery.automatic_subtitle({'mediaId': 189046, 'episode': 2, 'title': title},
                    key_reader=lambda: key, get_json=get_json or (lambda *args: []), ajatt_fetch=self.mirror)

    def test_missing_jimaku_key_uses_ajatt_and_reuses_validated_cache_offline(self):
        result = self.fetch()
        self.assertEqual(result['provider'], 'AJATT')
        self.assertEqual(result['sourceId'], 'AJATT.189046.E02.ja.srt')
        self.assertEqual(result['content'], TEXT)
        self.assertFalse(result['cached'])
        self.assertIn(FOLDER + '/.kitsuinfo.json', self.requests)
        cached = discovery.automatic_subtitle({'mediaId': 189046, 'episode': 2},
                    key_reader=lambda: self.fail('Offline playback must not read credentials'),
                    ajatt_fetch=lambda *args: self.fail('Offline playback must not contact AJATT'))
        self.assertTrue(cached['cached'])
        self.assertEqual(cached['provider'], 'AJATT')
        self.assertEqual(cached['content'], TEXT)

    def test_empty_unavailable_and_malformed_jimaku_results_use_ajatt(self):
        for response in ([], None, {'error': 'invalid'}):
            with self.subTest(response=response):
                with patch.object(discovery, '_cached', return_value=None):
                    self.assertEqual(self.fetch(key='private-fixture', get_json=lambda *args: response)['provider'], 'AJATT')
        with patch.object(discovery, '_cached', return_value=None):
            provider = Mock(side_effect=ValueError('Jimaku is unavailable (HTTP 429). Retry automatic search.'))
            self.assertEqual(self.fetch(key='private-fixture', get_json=provider)['provider'], 'AJATT')
        for path in Path(self.temp.name).rglob('*'):
            if path.is_file():
                self.assertNotIn('private-fixture', path.read_text())

    def test_jimaku_success_does_not_contact_ajatt(self):
        def provider(path, key):
            self.assertEqual(key, 'private-fixture')
            return ([{'id': 10, 'anilist_id': 189046}] if '/search?' in path else
                    [{'name': NAME, 'size': 100, 'url': 'https://jimaku.cc/entry/10/download/show.srt'}])
        result = discovery.automatic_subtitle({'mediaId': 189046, 'episode': 2, 'title': TITLE},
                    key_reader=lambda: 'private-fixture', get_json=provider, download=lambda url: TEXT.encode(),
                    ajatt_fetch=lambda *args: self.fail('Working Jimaku results must win'))
        self.assertEqual(result['provider'], 'Jimaku')
        metadata_path = Path(self.temp.name) / '.langplay-auto/189046-2.json'
        metadata = json.loads(metadata_path.read_text())
        metadata.pop('provider')
        metadata_path.write_text(json.dumps(metadata))
        cached = discovery.automatic_subtitle({'mediaId': 189046, 'episode': 2},
                    key_reader=lambda: self.fail('Legacy Jimaku caches must remain usable offline'))
        self.assertEqual(cached['provider'], 'Jimaku')
        self.assertTrue(cached['cached'])

    def test_unusable_jimaku_subtitle_falls_back_to_ajatt(self):
        def provider(path, key):
            return ([{'id': 10, 'anilist_id': 189046}] if '/search?' in path else
                    [{'name': NAME, 'size': 100, 'url': 'https://jimaku.cc/entry/10/download/show.srt'}])
        result = discovery.automatic_subtitle({'mediaId': 189046, 'episode': 2, 'title': TITLE},
                    key_reader=lambda: 'fixture', get_json=provider, download=lambda url: b'<html>invalid</html>',
                    ajatt_fetch=self.mirror)
        self.assertEqual(result['provider'], 'AJATT')

    def test_title_aliases_and_catalog_cache_are_used(self):
        for title in ('GENERATED SHOW 4TH SEASON', 'Generated Show Season 4', 'テスト 第４期'):
            with self.subTest(title=title), patch.object(discovery, '_cached', return_value=None):
                self.assertEqual(self.fetch(title=title)['provider'], 'AJATT')
        self.assertEqual(self.requests.count(ajatt.CATALOG_URL), 1)

    def test_expired_catalog_is_refreshed(self):
        self.fetch()
        with patch.object(ajatt, '_catalog', (time.monotonic() - 1, ())):
            with patch.object(discovery, '_cached', return_value=None):
                self.fetch()
        self.assertEqual(self.requests.count(ajatt.CATALOG_URL), 2)

    def test_missing_or_mismatched_identity_never_downloads_subtitle(self):
        for metadata in ({}, {'anilist_id': True, 'entry_type': 'anime_tv'},
                         {'anilist_id': 1, 'entry_type': 'anime_tv'},
                         {'anilist_id': 189046, 'entry_type': 'drama_tv'}, []):
            self.metadata = metadata
            with self.subTest(metadata=metadata), self.assertRaisesRegex(ValueError, 'AJATT'):
                self.fetch()
        self.assertTrue(all(url.endswith(('.html', '.json')) for url in self.requests))
        self.assertEqual(list(Path(self.temp.name).iterdir()), [])

    def test_unknown_or_invalid_titles_leave_manual_fallback(self):
        for title in (None, '', [], 'x' * 513, '---', '\ud800', 'Different Anime'):
            with self.subTest(title=repr(title)), self.assertRaisesRegex(ValueError, 'saved file'):
                self.fetch(title=title)
        self.assertNotIn(PAGE, self.requests)

    def test_only_explicit_matching_dialogue_episodes_are_downloaded(self):
        rejected = ['Show.E01.ja.srt', 'Show.E03.ja.srt', 'Show.E02.eng.srt',
                    'Show.E02.Signs.Songs.ass', 'Show.E01-E02.ja.srt', 'Show.ja.srt']
        self.page = '<table>' + ''.join(file_row(name) for name in rejected + [NAME]) + '</table>'
        self.assertEqual(self.fetch()['originalName'], NAME)
        downloaded = [url for url in self.requests if url.endswith(('.srt', '.ass'))]
        self.assertEqual(downloaded, [FOLDER + '/' + urllib.parse.quote(NAME)])

    def test_unsafe_or_oversized_files_are_skipped(self):
        self.page = '<table>' + file_row(url='https://example.com/file.srt') + file_row(size=discovery.MAX_BYTES + 1) + file_row(size=0) + '</table>'
        with self.assertRaisesRegex(ValueError, 'AJATT'):
            self.fetch()
        self.assertEqual(self.requests, [ajatt.CATALOG_URL, PAGE])

    def test_a_number_in_the_anime_title_is_not_treated_as_an_episode(self):
        self.catalog = CATALOG.replace(TITLE.encode(), b'Generated Show 2')
        self.page = '<table>' + file_row('Generated Show 2.ja.srt') + '</table>'
        with self.assertRaisesRegex(ValueError, 'AJATT'):
            self.fetch(title='Generated Show 2')
        self.assertEqual(self.requests, [ajatt.CATALOG_URL, PAGE])

    def test_ajatt_episode_caches_are_isolated(self):
        third = 'Show.S04E03.WEBRip.Amazon.ja.srt'
        self.page = '<table>' + file_row() + file_row(third) + '</table>'
        second = self.fetch()
        result = discovery.automatic_subtitle({'mediaId': 189046, 'episode': 3, 'title': TITLE},
                    key_reader=lambda: '', ajatt_fetch=self.mirror)
        self.assertEqual(result['sourceId'], 'AJATT.189046.E03.ja.srt')
        self.assertNotEqual(result['sourceId'], second['sourceId'])
        self.assertEqual(result['originalName'], third)

    def test_cache_with_a_mismatched_provider_is_not_reused(self):
        self.fetch()
        metadata_path = Path(self.temp.name) / '.langplay-auto/189046-2.json'
        metadata = json.loads(metadata_path.read_text())
        metadata['provider'] = 'Jimaku'
        metadata_path.write_text(json.dumps(metadata))
        self.assertFalse(self.fetch()['cached'])
        self.assertEqual(self.requests.count(FOLDER + '/' + NAME), 2)

    def test_malformed_preferred_file_is_not_cached_and_next_candidate_is_tried(self):
        malformed = 'A.Amazon.WEB.E02.ja.srt'
        self.page = '<table>' + file_row(malformed) + file_row() + '</table>'
        self.contents[malformed] = b'<html>error</html>'
        self.assertEqual(self.fetch()['originalName'], NAME)
        self.assertIn(FOLDER + '/' + malformed, self.requests)

    def test_tampered_ajatt_cache_is_revalidated(self):
        result = self.fetch()
        (Path(self.temp.name) / result['sourceId']).write_text('1\n00:00:01,000 --> invalid\n日本語\n')
        self.assertEqual(self.fetch()['content'], TEXT)
        self.assertEqual(self.requests.count(FOLDER + '/' + NAME), 2)

    def test_invalid_catalog_or_file_contents_leave_no_cache(self):
        for data in (b'<html>unavailable</html>', b'\xff'):
            with self.subTest(catalog=data), patch.object(ajatt, '_catalog', (0, ())):
                self.catalog = data
                with self.assertRaises(ValueError):
                    self.fetch()
        self.catalog = CATALOG
        self.contents[NAME] = b'<html>not a subtitle</html>'
        with self.assertRaisesRegex(ValueError, 'AJATT'):
            self.fetch()
        self.assertEqual(list(Path(self.temp.name).iterdir()), [])

    def test_episode_filename_patterns_are_conservative(self):
        accepted = ['Show.S04E02.ja.srt', 'Show.EP02.ass', 'Show Episode 02.srt',
                    '作品 第０２話.srt', 'Show - 02 [1080p][ABC].ass', 'Show 2.ass']
        rejected = ['Show.E20.srt', 'Show.E02-E03.srt', 'Show 01-02.srt', 'Show.E02.eng.srt',
                    'Show.E02.Signs.ass', 'Show.E02.Songs.srt', 'Show.E02.E03.srt', 'Show [1080p].ass']
        for name in accepted:
            with self.subTest(name=name):
                self.assertTrue(ajatt.episode_matches(name, 2))
        for name in rejected:
            with self.subTest(name=name):
                self.assertFalse(ajatt.episode_matches(name, 2))

    def test_url_policy_and_redirects_allow_only_catalog_and_mirror(self):
        for url in (ajatt.CATALOG_URL, PAGE, FOLDER + '/' + NAME, FOLDER + '/.kitsuinfo.json'):
            self.assertTrue(ajatt.trusted_url(url), url)
        rejected = ['http://subtitles.ajatt.top/index.html', 'https://subtitles.ajatt.top:8443/index.html',
                    'https://subtitles.ajatt.top@127.0.0.1/index.html', 'https://subtitles.ajatt.top/drama_tv/show.html',
                    FOLDER + '/../file.srt', FOLDER + '/%2e%2e/file.srt', FOLDER + '/%252e%252e.srt',
                    FOLDER + '/a%2fb.srt', FOLDER + '/a.srt?redirect=http://127.0.0.1', FOLDER + '/a.srt#fragment',
                    FOLDER.replace('/main/', '/other/') + '/' + NAME,
                    FOLDER.replace('Ajatt-Tools', 'Other-Owner') + '/' + NAME, 'https://127.0.0.1/file.srt']
        for url in rejected:
            with self.subTest(url=url):
                self.assertFalse(ajatt.trusted_url(url))
                with self.assertRaises(ValueError):
                    discovery.AjattRedirect().redirect_request(urllib.request.Request(ajatt.CATALOG_URL), None, 302, 'Found', {}, url)

    def test_transport_never_sends_jimaku_credentials_to_ajatt(self):
        response = Mock(url=ajatt.CATALOG_URL, headers={}, read1=Mock(side_effect=[CATALOG, b'']))
        opener = Mock()
        opener.open.return_value = nullcontext(response)
        with patch.object(discovery.urllib.request, 'build_opener', return_value=opener):
            self.assertEqual(discovery._fetch(ajatt.CATALOG_URL, time.monotonic() + 10, provider='AJATT'), CATALOG)
        request = opener.open.call_args.args[0]
        self.assertIsNone(request.get_header('Authorization'))
        with self.assertRaises(ValueError):
            discovery._fetch(ajatt.CATALOG_URL, time.monotonic() + 10, key='private-fixture', provider='AJATT')

    def test_ajatt_transport_enforces_size_deadline_and_final_url(self):
        with self.assertRaisesRegex(ValueError, 'timed out'):
            discovery._fetch(ajatt.CATALOG_URL, time.monotonic() - 1, provider='AJATT')
        for headers, url in (({'Content-Length': str(discovery.MAX_BYTES + 1)}, ajatt.CATALOG_URL),
                             ({'Content-Length': 'invalid'}, ajatt.CATALOG_URL), ({}, 'https://example.com/data')):
            response = Mock(url=url, headers=headers)
            opener = Mock()
            opener.open.return_value = nullcontext(response)
            with patch.object(discovery.urllib.request, 'build_opener', return_value=opener):
                with self.assertRaises(ValueError):
                    discovery._fetch(ajatt.CATALOG_URL, time.monotonic() + 10, provider='AJATT')

    def test_ajatt_rate_limit_error_does_not_request_a_jimaku_key(self):
        opener = Mock()
        opener.open.side_effect = urllib.error.HTTPError(ajatt.CATALOG_URL, 429, 'Limit', {}, None)
        with patch.object(discovery.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(ValueError, r'AJATT.*429'):
                discovery._fetch(ajatt.CATALOG_URL, time.monotonic() + 10, provider='AJATT')


if __name__ == '__main__':
    unittest.main()
