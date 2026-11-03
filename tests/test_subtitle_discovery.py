"""Automatic subtitle matching, private cache, and bounded provider access."""
import json
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
try:
    import subtitle_discovery as discovery
except ModuleNotFoundError:
    discovery = None

TEXT='1\n00:00:01,000 --> 00:00:03,000\n日本語です。\n'

class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(discovery, 'Automatic Japanese subtitle discovery is not implemented')
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.env=patch.dict(os.environ,{'LANGPLAY_SUBTITLE_DIR':self.temp.name})
        self.env.start(); self.addCleanup(self.env.stop)
        self.calls=[]; self.downloads=[]
        self.files=[{'name':'Show.S04E02.WEBRip.Amazon.ja.srt','size':100,
                     'url':'https://jimaku.cc/entry/10/download/show.srt'}]

    def api(self,path,key):
        self.calls.append(path)
        if '/search?' in path: return [{'id':10,'anilist_id':189046,'flags':{'anime':True}}]
        return self.files

    def download(self,url):
        self.downloads.append(url); return TEXT.encode()

    def fetch(self,episode=2,**kw):
        return discovery.automatic_subtitle({'mediaId':189046,'episode':episode},get_json=self.api,
                   download=self.download,key_reader=lambda:'fixture-key',**kw)

    def test_downloads_exact_episode_and_reuses_cache_without_key_or_network(self):
        result=self.fetch()
        self.assertEqual(result['content'],TEXT)
        self.assertEqual(result['sourceId'],'Jimaku.189046.E02.ja.srt')
        self.assertIn('/api/entries/10/files?episode=2',self.calls)
        cached=discovery.automatic_subtitle({'mediaId':189046,'episode':2},
                    key_reader=lambda:self.fail('cached playback must not need credentials'),
                    get_json=lambda *args:self.fail('cached playback must be offline'))
        self.assertEqual(cached['content'],TEXT); self.assertTrue(cached['cached'])
        self.assertEqual(len(self.downloads),1)
        for file in Path(self.temp.name).rglob('*'):
            if file.is_file(): self.assertNotIn('fixture-key',file.read_text())

    def test_caches_are_isolated_by_episode(self):
        a=self.fetch(1); b=self.fetch(2)
        self.assertNotEqual(a['sourceId'],b['sourceId'])
        self.assertIn('/api/entries/10/files?episode=1',self.calls)
        self.assertIn('/api/entries/10/files?episode=2',self.calls)

    def test_cache_with_non_string_original_name_remains_readable(self):
        self.fetch()
        metadata=Path(self.temp.name)/'.langplay-auto/189046-2.json'
        item=json.loads(metadata.read_text()); item['originalName']=None
        metadata.write_text(json.dumps(item))
        result=discovery.automatic_subtitle({'mediaId':189046,'episode':2},
            key_reader=lambda:self.fail('valid cache must remain offline'))
        self.assertEqual(result['originalName'],result['sourceId'])

    def test_prefers_bluray_japanese_ass_over_broadcast_srt(self):
        self.files = [
            {'name':'Show - E02 [TV].srt','size':100,'url':'https://jimaku.cc/entry/10/download/tv.srt'},
            {'name':'Show - 02 (BD 720p).ja.ass','size':100,'url':'https://jimaku.cc/entry/10/download/bd.ass'},
        ]
        ass='[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,日本語です。\n'
        self.download=lambda url:ass.encode() if url.endswith('bd.ass') else TEXT.encode()
        result=self.fetch()
        self.assertEqual(result['originalName'],'Show - 02 (BD 720p).ja.ass')

    def test_empty_zero_duration_ass_placeholder_does_not_reject_real_dialogue(self):
        header='[Events]\nFormat: Layer, Start, End, Style, Text\n'
        empty='Dialogue: 0,0:00:00.00,0:00:00.00,Default,\n'
        dialogue='Dialogue: 0,0:00:01.00,0:00:03.00,Default,日本語\n'
        content=header+empty+dialogue
        self.assertEqual(discovery._decode(content.encode(),'.ass'),content)
        with self.assertRaises(ValueError):
            discovery._decode((header+empty.replace('Default,','Default,日本語')).encode(),'.ass')

    def test_legacy_tv_cache_is_upgraded_but_remains_available_offline(self):
        self.files=[{'name':'Show E02 [TV].srt','size':100,'url':'https://jimaku.cc/entry/10/download/tv.srt'}]
        self.fetch()
        metadata=Path(self.temp.name)/'.langplay-auto/189046-2.json'
        item=json.loads(metadata.read_text());item.pop('selectionPolicy',None);metadata.write_text(json.dumps(item))
        offline=discovery.automatic_subtitle({'mediaId':189046,'episode':2},key_reader=lambda:'fixture-key',
            get_json=lambda *args:(_ for _ in ()).throw(ValueError('Offline')),
            ajatt_fetch=lambda *args:(_ for _ in ()).throw(ValueError('Offline')))
        self.assertTrue(offline['cached'])
        self.files=[{'name':'Show E02 WEB.ja.srt','size':100,'url':'https://jimaku.cc/entry/10/download/web.srt'}]
        result=self.fetch()
        self.assertEqual(result['originalName'],'Show E02 WEB.ja.srt')
        self.assertFalse(result['cached'])

    def test_external_movie_with_jimaku_hosted_subtitles_is_downloaded_and_cached(self):
        url = 'https://jimaku.cc/entry/2127/download/takagi-movie.srt'
        def api(path, key):
            self.calls.append(path)
            if '/search?' in path:
                return [{'id': 2127, 'anilist_id': 138425,
                         'flags': {'anime': True, 'movie': True, 'external': True, 'unverified': False}}]
            return [{'name': 'Karakai Jouzu no Takagi-san Movie (2022) [jpn].srt',
                     'size': len(TEXT.encode()), 'url': url}]
        result = discovery.automatic_subtitle({'mediaId': 138425, 'episode': 1},
                    get_json=api, download=self.download, key_reader=lambda: 'fixture-key',
                    ajatt_fetch=lambda *args: self.fail('A matching Jimaku movie must not fall back to AJATT'))
        self.assertEqual(result['content'], TEXT)
        self.assertEqual(result['provider'], 'Jimaku')
        self.assertEqual(result['sourceId'], 'Jimaku.138425.E01.ja.srt')
        self.assertEqual(self.downloads, [url])
        self.assertIn('/api/entries/2127/files?episode=1', self.calls)
        cached = discovery.automatic_subtitle({'mediaId': 138425, 'episode': 1},
                    key_reader=lambda: self.fail('cached movie must not need credentials'),
                    get_json=lambda *args: self.fail('cached movie must work offline'))
        self.assertTrue(cached['cached'])
        self.assertEqual(cached['content'], TEXT)

    def test_external_entry_cannot_download_subtitles_outside_jimaku(self):
        def api(path, key):
            if '/search?' in path:
                return [{'id': 10, 'anilist_id': 189046, 'flags': {'anime': True, 'external': True}}]
            self.calls.append(path)
            return [{'name': 'Show.E02.ja.srt', 'size': 100,
                     'url': 'https://example.com/subtitles.srt'}]
        with self.assertRaisesRegex(ValueError, 'usable matching Japanese'):
            discovery.automatic_subtitle({'mediaId': 189046, 'episode': 2},
                        get_json=api, download=self.download, key_reader=lambda: 'fixture-key')
        self.assertEqual(self.calls, ['/api/entries/10/files?episode=2'])
        self.assertEqual(self.downloads, [])
        self.assertEqual(list(Path(self.temp.name).rglob('*')), [])

    def test_prefers_japanese_web_srt_over_signs_english_and_tv(self):
        self.files=[{'name':'Show.E02.Signs.Songs.ass','size':100,'url':'https://jimaku.cc/entry/10/download/signs.ass'},
                    {'name':'Show.E02.eng.srt','size':100,'url':'https://jimaku.cc/entry/10/download/eng.srt'},
                    {'name':'Show.E02.AT-X.ja.ass','size':100,'url':'https://jimaku.cc/entry/10/download/tv.ass'},*self.files]
        self.assertEqual(self.fetch()['format'],'srt')
        self.assertEqual(self.downloads,['https://jimaku.cc/entry/10/download/show.srt'])

    def test_rejects_missing_identity_invalid_episode_and_untrusted_urls(self):
        for body in ({'mediaId':0,'episode':2},{'mediaId':189046,'episode':0},{'mediaId':189046,'episode':1.5},
                     {'mediaId':True,'episode':2},{'mediaId':189046,'episode':'../2'}):
            with self.assertRaises(ValueError): discovery.automatic_subtitle(body,get_json=self.api,download=self.download)
        self.files=[{'name':'Show.E02.ja.srt','size':100,'url':'http://127.0.0.1/private'}]
        with self.assertRaisesRegex(ValueError,'matching|usable|Japanese'): self.fetch()
        self.assertEqual(self.downloads,[])

    def test_missing_key_no_results_and_bad_subtitle_leave_manual_fallback(self):
        with self.assertRaisesRegex(ValueError,'Jimaku.*key'):
            discovery.automatic_subtitle({'mediaId':189046,'episode':2},key_reader=lambda:'')
        self.files=[]
        with self.assertRaisesRegex(ValueError,'matching|usable|Japanese'): self.fetch()
        self.files=[{'name':'Show.E02.ja.srt','size':100,'url':'https://jimaku.cc/entry/10/download/show.srt'}]
        with self.assertRaisesRegex(ValueError,'matching|usable|Japanese'):
            discovery.automatic_subtitle({'mediaId':189046,'episode':2},get_json=self.api,download=lambda u:b'<html>error</html>',key_reader=lambda:'fixture')

    def test_tampered_cache_is_not_used(self):
        result=self.fetch(); target=Path(self.temp.name)/result['sourceId']
        target.write_text('1\n00:00:01,000 --> 00:00:03,000\n違うファイル\n')
        self.assertEqual(self.fetch()['content'],TEXT)
        self.assertEqual(len(self.downloads),2)

    def test_malformed_preferred_subtitle_falls_back_before_caching(self):
        self.files = [
            {'name': 'A.WEB.ja.srt', 'size': 100, 'url': 'https://jimaku.cc/entry/10/download/bad.srt'},
            {'name': 'B.WEB.ja.srt', 'size': 100, 'url': 'https://jimaku.cc/entry/10/download/good.srt'},
        ]
        def download(url):
            self.downloads.append(url)
            return b'1\n00:00:01,000 --> not-a-time\n' + '日本語'.encode() if url.endswith('bad.srt') else TEXT.encode()
        result = discovery.automatic_subtitle({'mediaId': 189046, 'episode': 2},
                    get_json=self.api, download=download, key_reader=lambda: 'fixture')
        self.assertEqual(result['originalName'], 'B.WEB.ja.srt')
        self.assertEqual(result['content'], TEXT)
        self.assertEqual(len(self.downloads), 2)

    def test_legacy_malformed_cache_is_revalidated_even_with_a_matching_hash(self):
        result = self.fetch()
        malformed = '1\n00:00:01,000 --> not-a-time\n日本語\n'
        (Path(self.temp.name) / result['sourceId']).write_text(malformed)
        metadata = Path(self.temp.name) / '.langplay-auto/189046-2.json'
        data = json.loads(metadata.read_text())
        data['sha256'] = hashlib.sha256(malformed.encode()).hexdigest()
        metadata.write_text(json.dumps(data))
        self.assertEqual(self.fetch()['content'], TEXT)
        self.assertEqual(len(self.downloads), 2)

    def test_vtt_ass_and_ssa_validate_complete_timing_structure(self):
        vtt = 'WEBVTT\n\nNOTE metadata\n日本語\n\ncue\n00:01.000 --> 00:03.000 align:start\n日本語\n'
        ass = '[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,日本語\n'
        for extension, content in (('.vtt', vtt), ('.ass', ass), ('.ssa', ass)):
            with self.subTest(extension=extension):
                self.assertEqual(discovery._decode(content.encode(), extension), content)
                with self.assertRaises(ValueError):
                    discovery._decode(content.replace('00:03', '00:00').encode(), extension)
        for extension, content in (('.vtt', vtt.replace('WEBVTT', 'invalid')),
                                   ('.ass', ass.replace('End,', 'Missing,'))):
            with self.subTest(extension=extension), self.assertRaises(ValueError):
                discovery._decode(content.encode(), extension)

    def test_jimaku_credentials_are_read_from_existing_private_settings(self):
        profile=Path(self.temp.name)/'profile'
        (profile/'cache').mkdir(parents=True)
        (profile/'cache/ext_user_config_subtitle-engine.cache').write_text(json.dumps({'subtitle-engine':{'value':{'values':{'jimakuKey':'private-fixture'}}}}))
        with patch.dict(os.environ,{'LANGPLAY_SEANIME_DIR':str(profile),'LANGPLAY_JIMAKU_API_KEY':''}):
            self.assertEqual(discovery.jimaku_key(),'private-fixture')

    def test_download_policy_rejects_redirects_outside_jimaku(self):
        import urllib.request
        for url in ('http://jimaku.cc/entry/10/download/a.srt','https://jimaku.cc@127.0.0.1/entry/10/download/a.srt','https://example.com/a.srt','https://jimaku.cc:8443/a.srt'):
            self.assertFalse(discovery.trusted_url(url))
        with self.assertRaises(ValueError):
            discovery.JimakuRedirect().redirect_request(urllib.request.Request('https://jimaku.cc/entry/10/download/a.srt'),None,302,'Found',{},'http://127.0.0.1/private')

if __name__=='__main__': unittest.main()
