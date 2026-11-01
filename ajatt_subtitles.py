"""Find episode files in AJATT's public, AniList-identified subtitle mirror."""
from html.parser import HTMLParser
import json
from pathlib import PurePosixPath
import re
import time
import unicodedata
import urllib.parse

from saved_subtitles import FORMATS, MAX_BYTES

CATALOG_URL = 'https://subtitles.ajatt.top/index.html'
_catalog = (0, ())


def trusted_url(url):
    if not isinstance(url, str) or any(ord(char) < 32 for char in url):
        return False
    try:
        parsed = urllib.parse.urlsplit(url)
        if (parsed.scheme != 'https' or parsed.port not in (None, 443) or parsed.username
                or parsed.password or parsed.query or parsed.fragment):
            return False
        parts = [urllib.parse.unquote(part) for part in parsed.path.split('/')]
        if any(part in ('.', '..') or '/' in part or '\\' in part or '%' in part
               or any(ord(char) < 32 for char in part) for part in parts):
            return False
        if parsed.hostname == 'subtitles.ajatt.top':
            return (parts == ['', 'index.html'] or
                    len(parts) == 3 and parts[1] in ('anime_tv', 'anime_movie')
                    and parts[2].endswith('.html'))
        if parsed.hostname != 'raw.githubusercontent.com':
            return False
        prefix = ['', 'Ajatt-Tools', 'kitsunekko-mirror']
        if parts[:3] != prefix:
            return False
        tail = parts[3:]
        if tail[:3] == ['refs', 'heads', 'main']:
            tail = tail[3:]
        elif tail[:1] == ['main']:
            tail = tail[1:]
        else:
            return False
        return (len(tail) == 4 and tail[0] == 'subtitles' and tail[1] in ('anime_tv', 'anime_movie')
                and bool(tail[2]) and (tail[3] == '.kitsuinfo.json' or PurePosixPath(tail[3]).suffix.lower() in FORMATS))
    except (TypeError, ValueError):
        return False


def _title(value):
    return ''.join(char for char in unicodedata.normalize('NFKC', value).casefold() if char.isalnum())


class _Catalog(HTMLParser):
    def __init__(self):
        super().__init__()
        self.entries, self.row, self.cell, self.text = [], None, False, []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'tr':
            self.row = {'url': '', 'titles': []} if attrs.get('data-entry-type') in ('anime_tv', 'anime_movie') else None
        elif tag == 'td' and self.row is not None:
            self.cell = bool(set(attrs.get('class', '').split()) & {'entry_name', 'english_name', 'japanese_name'})
            self.text = []
        elif tag == 'a' and self.row is not None and self.cell:
            url = urllib.parse.urljoin(CATALOG_URL, attrs.get('href', ''))
            if trusted_url(url):
                self.row['url'] = url

    def handle_data(self, data):
        if self.cell:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == 'td' and self.row is not None:
            if self.cell:
                self.row['titles'].append(_title(''.join(self.text)))
            self.cell, self.text = False, []
        elif tag == 'tr':
            if self.row is not None and self.row['url']:
                self.entries.append(self.row)
            self.row, self.cell = None, False


class _Files(HTMLParser):
    def __init__(self):
        super().__init__()
        self.files, self.size = [], 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'tr':
            try:
                self.size = int(attrs.get('data-file-size', 0))
            except (TypeError, ValueError):
                self.size = 0
        elif tag == 'a' and 0 < self.size <= MAX_BYTES:
            url = attrs.get('href', '')
            if trusted_url(url) and urllib.parse.urlsplit(url).hostname == 'raw.githubusercontent.com':
                name = urllib.parse.unquote(urllib.parse.urlsplit(url).path.rsplit('/', 1)[-1])
                if (len(name) <= 256 and PurePosixPath(name).suffix.lower() in FORMATS
                        and not any(0xd800 <= ord(char) <= 0xdfff for char in name)):
                    self.files.append({'name': name, 'url': url, 'size': self.size})

    def handle_endtag(self, tag):
        if tag == 'tr':
            self.size = 0


def episode_matches(name, episode, titles=()):
    stem = unicodedata.normalize('NFKC', PurePosixPath(name).stem)
    if re.search(r'(^|[. _\[(-])(eng|english|en|signs?|songs?|ncop|nced)([. _\])&-]|$)', stem, re.I):
        return False
    if re.search(r'\d\s*[-~–]\s*(?:E(?:P)?)?\d', stem, re.I):
        return False
    numbers = re.findall(r'(?<![a-z0-9])(?:S\d{1,3})?E(?:P(?:ISODE)?)?[. _-]*(\d{1,5})(?!\d)', stem, re.I)
    numbers += re.findall(r'第\s*(\d{1,5})\s*話', stem)
    if numbers:
        return len(numbers) == 1 and int(numbers[0]) == episode
    match = re.search(r'(?:^|[ ._-])(\d{1,5})(?:v\d+)?(?:[ ._-]*(?:\[[^\]]*\]|\([^)]*\)|ja|jpn|jp))*$', stem, re.I)
    return bool(match and int(match[1]) == episode and _title(stem[:match.end(1)]) not in titles)


def candidates(title, media, episode, fetch):
    global _catalog
    if (not isinstance(title, str) or not 0 < len(title) <= 512
            or any(0xd800 <= ord(char) <= 0xdfff for char in title) or not _title(title)):
        raise ValueError('AJATT needs the anime title for safe matching. Load a saved file instead.')
    if _catalog[0] <= time.monotonic():
        parser = _Catalog()
        parser.feed(fetch(CATALOG_URL, 6 * 1024 * 1024).decode('utf-8'))
        if not parser.entries:
            raise ValueError('AJATT returned an invalid catalog. Retry automatic search.')
        _catalog = (time.monotonic() + 3600, parser.entries)
    wanted = _title(title)
    matches = [entry for entry in _catalog[1] if wanted in entry['titles']]
    for entry in matches[:3]:
        parser = _Files()
        parser.feed(fetch(entry['url'], 6 * 1024 * 1024).decode('utf-8'))
        files = [file for file in parser.files if episode_matches(file['name'], episode, entry['titles'])]
        folders = list(dict.fromkeys(file['url'].rsplit('/', 1)[0] for file in files))
        for folder in folders[:3]:
            try:
                metadata = json.loads(fetch(folder + '/.kitsuinfo.json', 65536))
            except (ValueError, OSError, RecursionError):
                continue
            if (isinstance(metadata, dict) and type(metadata.get('anilist_id')) is int
                    and metadata['anilist_id'] == media and metadata.get('entry_type') in ('anime_tv', 'anime_movie')):
                return [file for file in files if file['url'].rsplit('/', 1)[0] == folder]
    raise ValueError('No matching Japanese subtitles on AJATT. Load a saved file or retry later.')
