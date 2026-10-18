"""HTTP requirements for the word-only Google fallback; no real provider calls."""
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
from urllib.parse import urlparse, parse_qs

root=Path(os.environ.get('LANGPLAY_SOURCE_ROOT','/home/marsel/Projects/LangPlay'))
spec=importlib.util.spec_from_file_location('local_meaning_server',root/'Server.py')
server=importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class LocalMeaningRequirements(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),server.RequestHandler)
        cls.worker=threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.worker.join()

    def request(self,body,origin=None):
        headers={'Content-Type':'application/json'}
        if origin:headers['Origin']=origin
        conn=http.client.HTTPConnection('127.0.0.1',self.http.server_port,timeout=3)
        conn.request('POST','/api/dictionary',json.dumps(body),headers)
        response=conn.getresponse();raw=response.read();status=response.status;conn.close()
        try:data=json.loads(raw)
        except ValueError:data={'message':'Route did not return JSON'}
        return status,data

    def test_word_only_fixed_google_transport_returns_plain_text_senses(self):
        raw=json.dumps([[['jade','翡翠',None,None,1]],[['noun',['jade','kingfisher']]]]).encode()
        with patch.object(server.urllib.request,'urlopen',return_value=io.BytesIO(raw)) as send:
            status,data=self.request({'word':'翡翠'})
        self.assertEqual(status,200,data)
        self.assertEqual(data.get('status'),'success')
        self.assertIn('jade',data.get('meaning',''));self.assertIn('kingfisher',data['meaning'])
        self.assertNotIn('<span',data['meaning'])
        request=send.call_args.args[0];url=request.full_url if hasattr(request,'full_url') else request
        parsed=urlparse(url);query=parse_qs(parsed.query)
        self.assertEqual((parsed.scheme,parsed.hostname,parsed.path),('https','translate.googleapis.com','/translate_a/single'))
        self.assertEqual(query.get('q'),['翡翠'])
        self.assertEqual(query.get('sl'),['ja']);self.assertEqual(query.get('tl'),['en'])
        self.assertIsNone(query.get('sentence'));self.assertIsNone(query.get('key'))
        self.assertLessEqual(send.call_args.kwargs.get('timeout',999),6)

    def test_invalid_inputs_do_not_make_provider_requests(self):
        with patch.object(server.urllib.request,'urlopen') as send:
            for body in [{},[],{'word':''},{'word':' '},{'word':1},{'word':'翡'*257}]:
                status,data=self.request(body)
                self.assertEqual(status,400,data)
            send.assert_not_called()

    def test_untrusted_origin_is_rejected_before_network(self):
        with patch.object(server.urllib.request,'urlopen') as send:
            status,data=self.request({'word':'翡'},'https://example.com')
            self.assertEqual(status,403,data)
            send.assert_not_called()

    def test_timeout_is_an_actionable_word_lookup_failure(self):
        with patch.object(server.urllib.request,'urlopen',side_effect=TimeoutError('private transport detail')):
            status,data=self.request({'word':'瑠璃'})
        self.assertEqual(status,502,data)
        self.assertRegex(data.get('message','').lower(),r'translat|dictionary|lookup')
        self.assertNotIn('private transport detail',json.dumps(data))

    def test_invalid_or_oversized_provider_responses_are_not_success(self):
        for raw,word in [(b'not-json','琥珀'),(b'[]','石英'),(b'X'*65537,'水晶')]:
            with patch.object(server.urllib.request,'urlopen',return_value=io.BytesIO(raw)):
                status,data=self.request({'word':word})
            self.assertEqual(status,502,data)
            self.assertNotEqual(data.get('status'),'success')

if __name__=='__main__':unittest.main()
