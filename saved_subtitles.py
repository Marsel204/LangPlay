"""Bounded access to LangPlay's dedicated subtitle folder, never arbitrary paths."""
import codecs
import os
from pathlib import Path
import stat
import subprocess
import sys

MAX_BYTES = 10 * 1024 * 1024
FORMATS = {'.srt', '.vtt', '.ass', '.ssa'}


def default_folder():
    configured = os.environ.get('LANGPLAY_SUBTITLE_DIR')
    if configured:
        return Path(configured).expanduser()
    if sys.platform == 'win32':
        return Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local')) / 'LangPlay/subtitles'
    return Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')) / 'langplay-seanime/subtitles'


def subtitle_folder():
    folder = default_folder()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    return folder.resolve()


def saved_subtitles(body):
    folder = subtitle_folder()
    action = body.get('action')
    if action == 'list':
        files = []
        with os.scandir(folder) as entries:
            for index, entry in enumerate(entries):
                if index >= 1000:
                    break
                if Path(entry.name).suffix.lower() not in FORMATS or len(entry.name) > 256 or not entry.is_file(follow_symlinks=False):
                    continue
                info = entry.stat(follow_symlinks=False)
                if 0 < info.st_size <= MAX_BYTES:
                    files.append({'name': entry.name, 'size': info.st_size, 'modified': info.st_mtime})
        files.sort(key=lambda item: (-item['modified'], item['name']))
        return {'folder': str(folder), 'files': files[:200]}
    if action == 'open':
        if sys.platform == 'win32':
            os.startfile(str(folder))
        else:
            subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(folder)],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        return {'folder': str(folder)}
    if action != 'read':
        raise ValueError('Unknown saved subtitle action.')
    name = body.get('name')
    if not isinstance(name, str) or not name or len(name) > 256 or '/' in name or '\\' in name or '\x00' in name or Path(name).suffix.lower() not in FORMATS:
        raise ValueError('Choose a saved SRT, VTT, ASS or SSA subtitle.')
    path = folder / name
    if path.is_symlink() or path.resolve().parent != folder:
        raise ValueError('Choose a subtitle stored directly in the subtitle folder.')
    descriptor = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0))
    try:
        source = os.fdopen(descriptor, 'rb')
    except BaseException:
        os.close(descriptor)
        raise
    with source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= MAX_BYTES:
            raise ValueError('Subtitle must be between 1 byte and 10 MiB.')
        data = source.read(MAX_BYTES + 1)
    if len(data) != info.st_size or len(data) > MAX_BYTES:
        raise ValueError('Subtitle changed during reading. Try again.')
    encoding = body.get('encoding', 'auto')
    if encoding not in ('auto', 'shift_jis'):
        raise ValueError('Choose UTF-8 / BOM or Shift_JIS encoding.')
    if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        encoding = 'utf-16'
    elif data.startswith(codecs.BOM_UTF8) or encoding == 'auto':
        encoding = 'utf-8-sig'
    elif encoding == 'shift_jis':
        encoding = 'cp932'
    try:
        content = data.decode(encoding)
    except UnicodeError as error:
        raise ValueError('Cannot decode this subtitle. Try the other encoding or choose another file.') from error
    return {'sourceId': name, 'format': path.suffix[1:].lower(), 'content': content}
