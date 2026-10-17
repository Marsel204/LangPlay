"""Saved subtitle access stays inside its dedicated directory and byte budget."""
import json
from http.server import ThreadingHTTPServer
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

import Server
import saved_subtitles as saved


class SavedSubtitleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name) / 'subtitles'
        self.folder.mkdir()
        self.env = patch.dict(os.environ, {'LANGPLAY_SUBTITLE_DIR': str(self.folder)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.text = '1\n00:00:01,000 --> 00:00:02,000\n日本語\n'
        (self.folder / '日本語.SRT').write_text(self.text, encoding='utf-8-sig')

    def test_lists_and_reads_unicode_subtitles_without_sidecars(self):
        (self.folder / 'source.json').write_text('{}')
        (self.folder / 'empty.srt').touch()
        listing = saved.saved_subtitles({'action': 'list'})
        self.assertEqual([item['name'] for item in listing['files']], ['日本語.SRT'])
        self.assertEqual(listing['folder'], str(self.folder))
        subtitle = saved.saved_subtitles({'action': 'read', 'name': '日本語.SRT'})
        self.assertEqual(subtitle, {'sourceId': '日本語.SRT', 'format': 'srt', 'content': self.text})

    def test_rejects_traversal_symlinks_special_files_and_oversize(self):
        outside = Path(self.temp.name) / 'outside.srt'
        outside.write_text(self.text)
        (self.folder / 'link.srt').symlink_to(outside)
        with (self.folder / 'huge.srt').open('wb') as large:
            large.truncate(saved.MAX_BYTES + 1)
        names = ['../outside.srt', '..\\outside.srt', str(outside), 'source.json', 'link.srt', 'huge.srt']
        if hasattr(os, 'mkfifo'):
            os.mkfifo(self.folder / 'pipe.srt')
            names.append('pipe.srt')
        for name in names:
            with self.subTest(name=name), self.assertRaises(ValueError):
                saved.saved_subtitles({'action': 'read', 'name': name})
        self.assertEqual(len(saved.saved_subtitles({'action': 'list'})['files']), 1)

    def test_legacy_encoding_is_explicit_and_bom_is_respected(self):
        (self.folder / 'shift.srt').write_bytes(self.text.encode('shift_jis'))
        with self.assertRaisesRegex(ValueError, 'encoding'):
            saved.saved_subtitles({'action': 'read', 'name': 'shift.srt'})
        self.assertEqual(saved.saved_subtitles({'action': 'read', 'name': 'shift.srt', 'encoding': 'shift_jis'})['content'], self.text)
        (self.folder / 'utf16.srt').write_bytes(self.text.encode('utf-16'))
        self.assertEqual(saved.saved_subtitles({'action': 'read', 'name': 'utf16.srt'})['content'], self.text)

    def test_open_uses_only_the_fixed_folder_without_a_shell(self):
        with patch.object(saved.sys, 'platform', 'linux'), patch.object(saved.subprocess, 'Popen') as launch:
            saved.saved_subtitles({'action': 'open', 'name': '/arbitrary'})
        self.assertEqual(launch.call_args.args[0], ['xdg-open', str(self.folder)])
        self.assertNotIn('shell', launch.call_args.kwargs)

    def test_http_route_rejects_remote_origins_and_invalid_requests(self):
        http = ThreadingHTTPServer(('127.0.0.1', 0), Server.RequestHandler)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        try:
            def request(data, origin=None):
                headers = {'Content-Type': 'application/json'}
                if origin:
                    headers['Origin'] = origin
                req = urllib.request.Request(f'http://127.0.0.1:{http.server_port}/api/subtitles', json.dumps(data).encode(), headers)
                try:
                    response = urllib.request.urlopen(req, timeout=3)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    return response.code, json.load(response)
            self.assertEqual(request({'action': 'list'})[0], 200)
            self.assertEqual(request({'action': 'list'}, 'http://127.0.0.1:43211')[0], 200)
            self.assertEqual(request({'action': 'list'}, 'https://unrelated.example')[0], 403)
            self.assertEqual(request({'action': 'list'}, 'null')[0], 403)
            self.assertEqual(request([])[0], 400)
            self.assertEqual(request({'action': 'read', 'name': '../outside.srt'})[0], 400)
            self.assertEqual(request({'action': 'read', 'name': 'missing.srt'})[0], 404)
        finally:
            http.shutdown()
            http.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
