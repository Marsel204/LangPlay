"""Episode-scoped Jimaku discovery; credentials stay in the local companion."""
import codecs
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from saved_subtitles import MAX_BYTES, FORMATS, subtitle_folder, saved_subtitles

_slots = threading.BoundedSemaphore(2)


def jimaku_key():
    explicit = os.environ.get('LANGPLAY_JIMAKU_API_KEY', '').strip()
    if explicit:
        return explicit
    base = os.environ.get('LANGPLAY_SEANIME_DIR')
    if not base:
        base = str(Path(os.environ.get('APPDATA', Path.home() / 'AppData/Roaming')) / 'Seanime') if os.name == 'nt' else str(Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'Seanime')
    try:
        with (Path(base) / 'cache/ext_user_config_subtitle-engine.cache').open('rb') as source:
            raw = source.read(65537)
        if len(raw) > 65536:
            return ''
        value = json.loads(raw)['subtitle-engine']['value']['values'].get('jimakuKey', '')
        return value.strip() if isinstance(value, str) else ''
    except (OSError, ValueError, KeyError, TypeError):
        return ''


def trusted_url(url, entry=None):
    try:
        parsed = urllib.parse.urlparse(url)
        return (parsed.scheme == 'https' and parsed.hostname == 'jimaku.cc' and parsed.port in (None, 443)
                and not parsed.username and not parsed.password and not parsed.fragment
                and (entry is None or parsed.path.startswith(f'/entry/{entry}/download/')))
    except (ValueError, TypeError):
        return False


class JimakuRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        if not trusted_url(new_url):
            raise ValueError('Jimaku returned an unsupported subtitle download location.')
        return super().redirect_request(request, fp, code, message, headers, new_url)


def _fetch(url, deadline, key='', limit=MAX_BYTES):
    if not trusted_url(url):
        raise ValueError('Unsupported subtitle location.')
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValueError('Japanese subtitle search timed out. Retry automatic search.')
    headers = {'User-Agent': 'LangPlay/0.4 Japanese subtitle learning'}
    if key:
        headers['Authorization'] = key
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.build_opener(JimakuRedirect()).open(request, timeout=min(10, remaining)) as response:
            if not trusted_url(response.url):
                raise ValueError('Unsupported subtitle location.')
            if int(response.headers.get('Content-Length', 0)) > limit:
                raise ValueError('Japanese subtitle exceeds the size limit.')
            data = bytearray()
            while len(data) <= limit:
                if time.monotonic() >= deadline:
                    raise ValueError('Japanese subtitle search timed out. Retry automatic search.')
                chunk = response.read1(min(65536, limit + 1 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
            if len(data) > limit:
                raise ValueError('Japanese subtitle exceeds the size limit.')
            return bytes(data)
    except urllib.error.HTTPError as error:
        hints = {401: 'Check the Jimaku API key in Subtitle Engine preferences.', 403: 'Check the Jimaku API key in Subtitle Engine preferences.',
                 429: 'Jimaku rate limit reached. Wait and retry automatic search.'}
        raise ValueError(hints.get(error.code, f'Jimaku is unavailable (HTTP {error.code}). Retry automatic search.')) from None
    except (urllib.error.URLError, TimeoutError):
        raise ValueError('Jimaku could not be reached. Retry automatic search or load a saved subtitle.') from None


def _atomic(path, data):
    name = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.langplay-', delete=False) as output:
            name = Path(output.name)
            os.chmod(name, 0o600)
            output.write(data)
        os.replace(name, path)
    finally:
        if name and name.exists():
            name.unlink()


def _cached(folder, media, episode):
    metadata = folder / '.langplay-auto' / f'{media}-{episode}.json'
    try:
        if metadata.parent.is_symlink():
            return None
        descriptor = os.open(metadata, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0))
        with os.fdopen(descriptor, 'rb') as source:
            if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                return None
            raw = source.read(65537)
        if len(raw) > 65536:
            return None
        item = json.loads(raw)
        if item['mediaId'] != media or item['episode'] != episode or item['format'] not in ('srt', 'vtt', 'ass', 'ssa'):
            return None
        expected = f'Jimaku.{media}.E{episode:02d}.ja.{item["format"]}'
        if item['sourceId'] != expected:
            return None
        result = saved_subtitles({'action': 'read', 'name': expected})
        if hashlib.sha256(result['content'].encode('utf-8')).hexdigest() != item['sha256']:
            return None
        return {**result, 'cached': True, 'originalName': item.get('originalName', expected)}
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _rank(file):
    name = file['name'].lower()
    return (0 if re.search(r'web|amazon|netflix|crunchy', name) else 1,
            {'.srt': 0, '.vtt': 1, '.ass': 2, '.ssa': 3}[Path(name).suffix],
            0 if re.search(r'\.ja\b|\.ja[-_]|jpn|japanese', name) else 1,
            0 if 'amazon' in name else 1, name)


def _decode(data, extension):
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_BYTES:
        raise ValueError('No usable Japanese subtitle file.')
    encoding = 'utf-16' if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)) else 'utf-8-sig'
    try:
        content = data.decode(encoding)
    except UnicodeError:
        content = data.decode('shift_jis')
    if not re.search(r'[\u3040-\u30ff\u3400-\u9fff]', content):
        raise ValueError('No usable Japanese subtitle text.')
    timing = r'(?m)^Dialogue\s*:' if extension in ('.ass', '.ssa') else r'\d{2}:\d{2}(?::\d{2})?[,.]\d{2,3}\s*-->'
    if not re.search(timing, content, re.IGNORECASE):
        raise ValueError('No usable Japanese subtitle cues.')
    return content


def automatic_subtitle(body, *, get_json=None, download=None, key_reader=None):
    media, episode = body.get('mediaId'), body.get('episode')
    if type(media) is not int or not 0 < media < 2**31 or type(episode) is not int or not 0 < episode <= 100000:
        raise ValueError('Start an identified anime episode before automatic subtitle search.')
    folder = subtitle_folder()
    cached = _cached(folder, media, episode)
    if cached:
        return cached
    key = (key_reader or jimaku_key)()
    if not key:
        raise ValueError('Configure your Jimaku API key in Subtitle Engine preferences, then retry automatic search.')
    if not _slots.acquire(timeout=.1):
        raise ValueError('Japanese subtitle search is busy. Retry in a moment.')
    try:
        deadline = time.monotonic() + 40
        get_json = get_json or (lambda path, auth: json.loads(_fetch('https://jimaku.cc' + path, deadline, auth, 512 * 1024)))
        download = download or (lambda url: _fetch(url, deadline))
        entries = get_json(f'/api/entries/search?anilist_id={media}', key)
        matches = [e for e in entries if isinstance(e, dict) and e.get('anilist_id') == media and type(e.get('id')) is int
                   and e.get('flags', {}).get('anime', True) and not e.get('flags', {}).get('external')]
        matches.sort(key=lambda e: (e.get('flags', {}).get('unverified', False), e['id']))
        if not matches:
            raise ValueError('No matching Japanese subtitles on Jimaku. Load a saved file instead.')
        entry = matches[0]['id']
        files = get_json(f'/api/entries/{entry}/files?episode={episode}', key)
        candidates = [f for f in files if isinstance(f, dict) and isinstance(f.get('name'), str) and len(f['name']) <= 256
                      and Path(f['name']).suffix.lower() in FORMATS and trusted_url(f.get('url'), entry)
                      and type(f.get('size')) is int and 0 < f['size'] <= MAX_BYTES
                      and not re.search(r'(^|[. _\[(-])(eng|english|en|signs?|songs?)([. _\])&-]|$)', f['name'], re.I)]
        candidates.sort(key=_rank)
        for file in candidates[:3]:
            extension = Path(file['name']).suffix.lower()
            try:
                content = _decode(download(file['url']), extension)
            except (ValueError, OSError, UnicodeError):
                continue
            name = f'Jimaku.{media}.E{episode:02d}.ja{extension}'
            cache_dir = folder / '.langplay-auto'
            if cache_dir.is_symlink():
                raise ValueError('Automatic subtitle cache is unavailable. Load a saved subtitle instead.')
            cache_dir.mkdir(mode=0o700, exist_ok=True)
            _atomic(folder / name, content.encode('utf-8'))
            metadata = {'mediaId': media, 'episode': episode, 'sourceId': name, 'format': extension[1:],
                        'originalName': file['name'], 'sha256': hashlib.sha256(content.encode('utf-8')).hexdigest()}
            _atomic(cache_dir / f'{media}-{episode}.json', json.dumps(metadata, ensure_ascii=False).encode())
            return {'sourceId': name, 'format': extension[1:], 'content': content, 'cached': False, 'originalName': file['name']}
        raise ValueError('No usable matching Japanese subtitles found. Load a saved file or retry later.')
    finally:
        _slots.release()
