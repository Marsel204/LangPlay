"""Automatic subtitle matching, private cache, and bounded provider access."""
import json
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
