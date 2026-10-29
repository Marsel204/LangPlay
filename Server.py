#!/usr/bin/env python3
"""
LinguaPlay — Multithreaded Backend Server (Server.py)
Standard-library based ThreadingHTTPServer providing non-blocking request handling,
YouTube caption/search/stream extraction with caching and timeouts, local Anki bookmarking,
and native Antigravity CLI / Gemini AI linguistic analysis.
"""

import argparse
import glob
import http.client
import http.server
import ipaddress
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from japanese_parser import parse_japanese, ParserUnavailable
from saved_subtitles import saved_subtitles
from subtitle_discovery import automatic_subtitle

# ── Configuration & Paths ──
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ANKI_FILE = os.path.join(BASE_DIR, "anki_cards.txt")
INNERPLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
CLIENT_CONTEXT = {
    "client": {
        "clientName": "TVHTML5",
        "clientVersion": "7.20240813.07.00",
    }
}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# ── Caches & Thread Synchronization ──
file_lock = threading.Lock()
cache_lock = threading.Lock()
caption_cache = {}   # video_id -> (timestamp, vtt_data)
search_cache = {}    # query -> (timestamp, list_of_videos)
stream_cache = {}    # video_id -> (timestamp, stream_url)
ai_analysis_cache = {} # structured provider/prompt context -> (timestamp, parsed_json)
dictionary_cache = {}  # word -> (timestamp, plain-text meaning)
sentence_translation_cache = {}  # sentence -> (timestamp, English translation)
dictionary_slots = threading.BoundedSemaphore(4)
CACHE_TTL = 3600     # 1 hour
ANTIGRAVITY_TIMEOUT_SECONDS = 90
MAX_AGY_PROMPT_BYTES = 16 * 1024


class PromptTooLong(ValueError):
    pass


def get_from_cache(cache_dict, key):
    with cache_lock:
        if key in cache_dict:
            ts, val = cache_dict[key]
            if time.time() - ts < CACHE_TTL:
                return val
            del cache_dict[key]
    return None


def set_in_cache(cache_dict, key, val):
    with cache_lock:
        if len(cache_dict) > 200:
            oldest_key = min(cache_dict.keys(), key=lambda k: cache_dict[k][0])
            del cache_dict[oldest_key]
        cache_dict[key] = (time.time(), val)


def find_agy_binary():
    """Locate Antigravity CLI binary"""
    custom_paths = [
        "/home/marsel/.local/bin/agy",
        os.path.expanduser("~/.local/bin/agy"),
        os.path.expanduser("~/bin/agy"),
    ]
    for p in custom_paths:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return shutil.which("agy")


def lookup_google_word(word):
    """Extension-style fallback for a single missing word, never an AI request."""
    return google_translate(word, dictionary=True)


def google_translate(text, *, dictionary=False):
    """Direct translation, with no generative explanation or AI fallback."""
    limit = 256 if dictionary else 4096
    label = 'word' if dictionary else 'sentence'
    if not isinstance(text, str) or not text.strip() or len(text) > limit:
        raise ValueError(f"Choose a {label} of 1 to {limit} characters.")
    text = text.strip()
    cache = dictionary_cache if dictionary else sentence_translation_cache
    cached = get_from_cache(cache, text)
    if cached is not None:
        return cached
    if not dictionary_slots.acquire(timeout=.1):
        raise LookupError("Translation is busy. Retry shortly.")
    try:
        params = [
            ('client', 'gtx'), ('sl', 'ja'), ('tl', 'en'),
            ('dt', 't'), ('q', text),
        ]
        if dictionary:
            params.append(('dt', 'bd'))
        query = urllib.parse.urlencode(params)
        request = urllib.request.Request(
            'https://translate.googleapis.com/translate_a/single?' + query,
            headers={'User-Agent': UA})
        with urllib.request.urlopen(request, timeout=6) as response:
            raw = response.read(65537)
        if len(raw) > 65536:
            raise ValueError('Oversized dictionary reply')
        data = json.loads(raw.decode('utf-8'))
        if not isinstance(data, list) or not data:
            raise ValueError('Invalid dictionary reply')
        segments = data[0] if isinstance(data[0], list) else []
        translation = ''.join(row[0] for row in segments[:128]
                              if isinstance(row, list) and row and isinstance(row[0], str)).strip()
        senses = []
        for row in (data[1] if dictionary and len(data) > 1 and isinstance(data[1], list) else [])[:8]:
            if not isinstance(row, list) or len(row) < 2 or not isinstance(row[0], str) or not isinstance(row[1], list):
                continue
            definitions = [item for item in row[1][:4] if isinstance(item, str) and item.strip()]
            if definitions:
                senses.append(row[0] + ': ' + ', '.join(definitions))
        meaning = ' — '.join(part for part in [translation, ' | '.join(senses)] if part)
        if not meaning or len(meaning) > 8192:
            raise ValueError('No usable dictionary meaning')
        set_in_cache(cache, text, meaning)
        return meaning
    except Exception:
        raise LookupError("Translation unavailable. Check the connection and retry.") from None
    finally:
        dictionary_slots.release()


def build_ai_prompt(word, sentence, romaji=""):
    return f"""You are an expert Japanese immersion tutor.
Focus strictly on HOW THE TARGET WORD FITS INTO THIS SPECIFIC CONTEXT SENTENCE.
Do NOT provide random/unrelated example sentences or generic dictionary essays.
Instead, provide the translation of THIS context sentence and a complete word-by-word breakdown of THIS context sentence.

Context Sentence: "{sentence or word}"
Target Word: "{word}" (Reading: {romaji or ''})

Requirements:
1. Provide accurate Romaji for all Japanese words and readings.
2. Provide a complete word-by-word breakdown list of every token in this context sentence ("{sentence or word}").
3. Flag the target word with "is_target": true in the breakdown.
4. Translate the entire context sentence into natural English.

Respond with ONLY a valid, raw JSON object (strictly no markdown fences, no backticks):
{{
  "contextual_meaning": "Precise meaning of '{word}' specifically in this sentence",
  "reading": "Hiragana reading of '{word}'",
  "romaji": "Romaji transcription of '{word}'",
  "jlpt_level": "N5|N4|N3|N2|N1|Vocab",
  "pos": "Part of speech in this sentence",
  "sentence_fit": {{
    "phrase_connection": "How '{word}' connects to surrounding words in this line (e.g. 書架の → 隙間に → 住まう)",
    "role_in_sentence": "Direct syntactic function in this sentence (e.g. Locative noun marked by に (ni), specifying where the subject dwells)",
    "context_nuance": "Specific contextual nuance of '{word}' in this line (1 concise sentence)"
  }},
  "conjugation": {{
    "is_conjugated": false,
    "form": "Inflection form name if conjugated, or null",
    "base_form": "Base dictionary form",
    "explanation": "Why this specific inflection is used here"
  }},
  "sentence_translation": {{
    "jp": "{sentence or word}",
    "en": "Natural English translation of this context sentence"
  }},
  "word_by_word": [
    {{
      "word": "Segment Japanese (e.g. 書架)",
      "reading": "Hiragana reading (e.g. しょか)",
      "romaji": "Romaji transcription (e.g. shoka)",
      "meaning": "English meaning (e.g. bookshelf)",
      "role": "noun | particle | verb | adjective | auxiliary",
      "is_target": false
    }}
  ]
}}"""


def run_antigravity_prompt(prompt):
    if len(prompt.encode('utf-8')) > MAX_AGY_PROMPT_BYTES:
        raise PromptTooLong('AI context exceeds 16 KiB. Shorten the sentence, prompt or conversation and retry.')
    agy_bin = find_agy_binary()
    if not agy_bin:
        raise RuntimeError("Antigravity CLI ('agy') not found in PATH or ~/.local/bin/agy")

    cmd = [agy_bin, "--print", prompt]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=ANTIGRAVITY_TIMEOUT_SECONDS)

    if result.returncode != 0:
        err_msg = result.stderr.strip() or f"Process exited with code {result.returncode}"
        raise RuntimeError(f"Antigravity CLI error: {err_msg}")

    stdout = result.stdout.strip()
    if not stdout:
        raise RuntimeError("Antigravity CLI returned an empty reply")
    return stdout


def run_antigravity_chat(messages, word="", sentence="", romaji=""):
    conversation = "\n\n".join(f"{message['role'].upper()}:\n{message['content']}" for message in messages)
    prompt = (
        "You are Sensei, a Japanese grammar tutor. Answer the latest user question using the conversation below. "
        "Reply in readable Markdown, not JSON. Use romaji when explaining Japanese.\n\n"
        f"Context Sentence: {sentence}\nTarget Word: {word} ({romaji})\n\n"
        f"Conversation in chronological order:\n{conversation}\n\nASSISTANT:\n"
    )
    return run_antigravity_prompt(prompt)


def run_antigravity_analysis(word, sentence, romaji="", custom_prompt=""):
    print(f"  🤖 Running Antigravity CLI for: '{word}'...")
    prompt = custom_prompt if custom_prompt else build_ai_prompt(word, sentence, romaji)
    stdout = run_antigravity_prompt(prompt)
    clean_json = stdout
    if clean_json.startswith("```json"):
        clean_json = clean_json[7:]
    if clean_json.startswith("```"):
        clean_json = clean_json[3:]
    if clean_json.endswith("```"):
        clean_json = clean_json[:-3]
    clean_json = clean_json.strip()

    try:
        return json.loads(clean_json)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", clean_json)
        if match:
            return json.loads(match.group(0))
        raise ValueError(f"Could not parse Antigravity response as JSON: {stdout[:200]}")


def run_gemini_api_analysis(word, sentence, romaji, api_key, custom_prompt=""):
    if not api_key or not api_key.strip():
        raise ValueError("Missing Gemini API key")

    prompt = custom_prompt if custom_prompt else build_ai_prompt(word, sentence, romaji)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key.strip()}"
    payload = json.dumps({
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2
        }
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = json.loads(resp.read().decode("utf-8"))
        candidate = raw.get("candidates", [{}])[0]
        content_text = candidate.get("content", {}).get("parts", [{}])[0].get("text", "")
        return json.loads(content_text.strip())



def configured_ai_provider(requested=None):
    if requested is not None and not isinstance(requested, str):
        raise ValueError('AI provider must be a string')
    provider = requested or os.environ.get("LANGPLAY_AI_PROVIDER", "antigravity")
    if not isinstance(provider, str):
        raise ValueError("AI provider must be a string")
    return provider.strip().lower()


def router_config():
    base = os.environ.get('LANGPLAY_9ROUTER_BASE_URL', '').strip() or 'http://127.0.0.1:20128/v1'
    parsed = urllib.parse.urlsplit(base)
    try:
        valid = parsed.scheme in ('http', 'https') and parsed.hostname and parsed.port != 0
    except ValueError:
        valid = False
    if not valid or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('9Router URL must use HTTP(S), without credentials, query or fragment.')
    path = parsed.path.rstrip('/')
    if path.endswith('/chat/completions'):
        path = path[:-len('/chat/completions')]
    if not path:
        path = '/v1'
    model = os.environ.get('LANGPLAY_9ROUTER_MODEL', '').strip()
    if not model:
        raise ValueError('Set LANGPLAY_9ROUTER_MODEL to your exact model or combo ID.')
    key = os.environ.get('LANGPLAY_9ROUTER_API_KEY', '').strip()
    if any(c in key for c in '\r\n'):
        raise ValueError('9Router token must be a single line.')
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, '', '')), key, model


class RouterNoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('9Router redirect rejected. Configure the final API URL directly.')


def run_router_completion(messages, json_output=False):
    base, key, model = router_config()
    payload = {'model': model, 'messages': messages, 'stream': False, 'max_tokens': 4096}
    if json_output:
        payload['response_format'] = {'type': 'json_object'}
    headers = {'Content-Type': 'application/json'}
    if key:
        headers['Authorization'] = 'Bearer ' + key
    request = urllib.request.Request(base + '/chat/completions', data=json.dumps(payload).encode(), headers=headers)
    try:
        with urllib.request.build_opener(RouterNoRedirect()).open(request, timeout=45) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise RuntimeError('9Router response is oversized. Retry with a shorter request.')
        data = json.loads(raw)
        choices = data.get('choices') if isinstance(data, dict) else None
        choice = choices[0] if isinstance(choices, list) and choices else None
        if not isinstance(choice, dict) or choice.get('finish_reason') != 'stop':
            raise RuntimeError('9Router returned an incomplete or malformed reply. Retry with a shorter request.')
        message = choice.get('message')
        content = message.get('content') if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError('9Router returned an empty or malformed reply. Please retry.')
        return content.strip()
    except urllib.error.HTTPError as error:
        hint = {401: 'Token rejected. Check the router token.', 403: 'Token rejected or access denied.', 429: 'Rate limit reached. Wait and retry.'}.get(error.code, 'Check the router configuration and retry.')
        raise RuntimeError('9Router request failed. ' + hint) from None
    except (TimeoutError, urllib.error.URLError, OSError, http.client.HTTPException):
        raise RuntimeError('9Router unreachable or timed out. Check its address and that it is running.') from None
    except (ValueError, UnicodeError):
        raise RuntimeError('9Router returned malformed JSON. Please retry.') from None


def run_router_analysis(word, sentence, romaji='', custom_prompt=''):
    content = run_router_completion([{'role': 'user', 'content': custom_prompt or build_ai_prompt(word, sentence, romaji)}], True)
    try:
        result = json.loads(content)
        if not isinstance(result, dict) or not result:
            raise ValueError()
        return result
    except ValueError:
        raise RuntimeError('9Router returned an invalid explanation. Please retry.') from None


def run_router_chat(messages, word='', sentence='', romaji=''):
    context = f'You are Sensei, a Japanese grammar tutor. Answer in concise Markdown with romaji.\nContext Sentence: {sentence}\nTarget Word: {word} ({romaji})'
    return run_router_completion([{'role': 'system', 'content': context}, *messages])


def router_status():
    try:
        _, _, model = router_config()
        return {'router_configured': True, 'router_model': model}
    except ValueError:
        return {'router_configured': False, 'router_model': ''}


def run_deepseek_completion(messages, api_key="", json_output=False):
    # Credentials stay in the local companion, never in the plugin bundle.
    key = (api_key or os.environ.get("LANGPLAY_DEEPSEEK_API_KEY", "")).strip()
    if not key:
        raise ValueError("Missing DeepSeek API key. Configure LANGPLAY_DEEPSEEK_API_KEY in the companion.")
    payload = {
        "model": os.environ.get("LANGPLAY_DEEPSEEK_MODEL", "deepseek-flash"),
        "messages": messages, "thinking": {"type": "disabled"},
        "max_tokens": 4096 if json_output else 1536,
    }
    if json_output:
        payload["response_format"] = {"type": "json_object"}
    request = urllib.request.Request("https://api.deepseek.com/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise RuntimeError("DeepSeek returned an oversized response.")
            data = json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as error:
        hints = {401: "API key rejected. Replace it and retry.", 402: "Insufficient API balance. Add credit and retry.",
                 429: "Rate limit reached. Wait briefly and retry."}
        # Never return the raw provider response or request headers.
        raise RuntimeError(f"DeepSeek request failed (HTTP {error.code}). " + hints.get(error.code, "Please retry.")) from None
    except (TimeoutError, urllib.error.URLError):
        raise RuntimeError("DeepSeek did not respond. Check the connection and retry.") from None
    choices = data.get("choices") or []
    if not choices or choices[0].get("finish_reason") != "stop":
        raise RuntimeError("DeepSeek returned an incomplete reply. Retry with a shorter question or sentence.")
    content = choices[0].get("message", {}).get("content")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("DeepSeek returned an empty reply. Please retry.")
    return content.strip()


def run_deepseek_analysis(word, sentence, romaji="", api_key="", custom_prompt=""):
    prompt = custom_prompt or build_ai_prompt(word, sentence, romaji)
    result = json.loads(run_deepseek_completion([{"role": "user", "content": prompt}], api_key, json_output=True))
    if not isinstance(result, dict):
        raise ValueError("DeepSeek returned an invalid explanation. Please retry.")
    return result


def run_deepseek_chat(messages, word="", sentence="", romaji="", api_key=""):
    context = ("You are Sensei, a Japanese grammar tutor. Answer the latest question in concise, readable Markdown. "
               "Use romaji alongside Japanese. Explain the captured sentence and word.\n\n"
               f"Context Sentence: {sentence}\nTarget Word: {word} ({romaji})")
    return run_deepseek_completion([{"role": "system", "content": context}, *messages], api_key)


def http_get_backend(url, headers=None, data=None, timeout=8):
    req_headers = {"User-Agent": UA, "Accept-Language": "ja,en;q=0.8"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def get_caption_tracks_backend(video_id):
    """Bypasses PO-tokens using the TVHTML5 client payload or raw page scrape"""
    try:
        payload = json.dumps({"context": CLIENT_CONTEXT, "videoId": video_id}).encode()
        raw = http_get_backend(
            INNERPLAYER_URL,
            headers={"Content-Type": "application/json"},
            data=payload,
            timeout=7,
        )
        data = json.loads(raw)
        tracks = (
            data.get("captions", {})
            .get("playerCaptionsTracklistRenderer", {})
            .get("captionTracks")
        )
        if tracks:
            return tracks
    except Exception as e:
        print(f"  [Captions] InnerTube TV POST failed: {e}; trying structural page scrape")

    try:
        html = http_get_backend(f"https://www.youtube.com/watch?v={video_id}&hl=ja", timeout=7)
        m = re.search(r"ytInitialPlayerResponse\s*=\s*(\{.*?\});", html)
        if not m:
            start = html.find("ytInitialPlayerResponse")
            if start != -1:
                eq = html.find("{", start)
                if eq != -1:
                    depth = 0
                    in_str = False
                    esc = False
                    for i in range(eq, len(html)):
                        c = html[i]
                        if in_str:
                            if esc:
                                esc = False
                            elif c == "\\":
                                esc = True
                            elif c == '"':
                                in_str = False
                        else:
                            if c == '"':
                                in_str = True
                            elif c == "{":
                                depth += 1
                            elif c == "}":
                                depth -= 1
                                if depth == 0:
                                    try:
                                        data = json.loads(html[eq:i + 1])
                                        tracks = (
                                            data.get("captions", {})
                                            .get("playerCaptionsTracklistRenderer", {})
                                            .get("captionTracks")
                                        )
                                        if tracks:
                                            return tracks
                                    except Exception:
                                        pass
                                    break
        else:
            try:
                data = json.loads(m.group(1))
                return (
                    data.get("captions", {})
                    .get("playerCaptionsTracklistRenderer", {})
                    .get("captionTracks", [])
                )
            except Exception:
                pass
    except Exception as e:
        print(f"  [Captions] Page scrape extractor failed: {e}")

    return []


def pick_track_backend(tracks, lang_prefix="ja"):
    if not tracks:
        return None
    matching = [t for t in tracks if (t.get("languageCode") or "").lower().startswith(lang_prefix.lower())]
    if matching:
        authored = [t for t in matching if (t.get("kind") or "") != "asr"]
        return authored[0] if authored else matching[0]
    return tracks[0]


class RequestHandler(http.server.SimpleHTTPRequestHandler):
    request_timeout = 10

    def setup(self):
        self.request.settimeout(self.request_timeout)
        super().setup()

    def handle_one_request(self):
        self._receiving_request = True
        self._request_read_expired = False
        self._receive_timer = threading.Timer(self.request_timeout, self._expire_request_read)
        self._receive_timer.daemon = True
        self._receive_timer.start()
        try:
            super().handle_one_request()
        finally:
            self._finish_request_read()

    def _expire_request_read(self):
        if not self._receiving_request:
            return
        self._request_read_expired = True
        try:
            self.connection.shutdown(socket.SHUT_RD)
        except OSError:
            pass

    def _finish_request_read(self):
        self._receiving_request = False
        timer = getattr(self, '_receive_timer', None)
        if timer:
            timer.cancel()

    def parse_request(self):
        valid = super().parse_request()
        if valid and self._request_read_expired:
            self.send_error(408, 'Request receive timed out.')
            return False
        if valid and self.command != 'POST':
            self._finish_request_read()
        return valid

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def origin_allowed(self, local_only=False):
        value = self.headers.get('Origin')
        if not value:
            return True  # Native host and companion clients do not send Origin.
        try:
            origin = urllib.parse.urlsplit(value)
            if origin.username or origin.password or origin.path or origin.query or origin.fragment:
                return False
            if origin.scheme == 'http' and origin.hostname in ('127.0.0.1', 'localhost', '::1'):
                return True
            if local_only:
                return False
            if origin.scheme in ('chrome-extension', 'moz-extension') and origin.hostname:
                return True
            if origin.scheme == 'https' and (origin.hostname == 'youtube.com' or (origin.hostname or '').endswith('.youtube.com')):
                return True
            # Explicit LAN hosting keeps same-origin access through a private IP.
            return (origin.scheme == 'http' and origin.netloc == self.headers.get('Host')
                    and ipaddress.ip_address(origin.hostname).is_private)
        except (ValueError, TypeError):
            return False

    def send_head(self):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if '\x00' in path:
            self.send_error(404, 'Not Found')
            return None
        if path == '/':
            self.path = path = '/index.html'
        target = os.path.realpath(self.translate_path(path))
        root = os.path.realpath(BASE_DIR)
        static = os.path.join(root, 'static')
        public_page = path in ('/index.html', '/App.html') and target == os.path.join(root, path[1:])
        try:
            public_asset = (path.startswith('/static/') and not any(part.startswith('.') for part in path.split('/') if part)
                            and os.path.commonpath((target, static)) == static)
        except ValueError:
            public_asset = False  # A symlink may resolve onto another Windows drive.
        if not (public_page or public_asset) or not os.path.isfile(target):
            self.send_error(404, 'Not Found')
            return None
        return super().send_head()

    def log_message(self, format, *args):
        try:
            sys.stdout.write(f"[{time.strftime('%H:%M:%S')}] {format % args}\n")
        except Exception:
            sys.stdout.write(f"[{time.strftime('%H:%M:%S')}] {' '.join(str(a) for a in args)}\n")

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type, Accept, Authorization")

    def send_raw_response(self, code, content_type, data_bytes):
        try:
            self.send_response(code)
            self.send_cors_headers()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data_bytes)))
            self.end_headers()
            self.wfile.write(data_bytes)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_json_response(self, code, payload):
        try:
            body = json.dumps(payload).encode("utf-8")
            self.send_raw_response(code, "application/json; charset=utf-8", body)
        except Exception:
            pass

    def do_OPTIONS(self):
        if not self.origin_allowed():
            self.send_json_response(403, {"status": "error", "message": "Origin is not allowed."})
            return
        self.send_response(200, "OK")
        self.send_cors_headers()
        self.end_headers()

    def read_json_object(self, max_bytes, text_fields=()):
        length = int(self.headers.get('Content-Length', 0))
        if not 0 < length <= max_bytes:
            raise ValueError(f'Request must contain JSON between 1 and {max_bytes} bytes.')
        try:
            raw = self.rfile.read(length)
        except TimeoutError:
            raise ValueError('Request body timed out.') from None
        finally:
            self._finish_request_read()
        if getattr(self, '_request_read_expired', False):
            raise ValueError('Request body timed out.')
        if len(raw) != length:
            raise ValueError('Request body is incomplete.')
        try:
            body = json.loads(raw.decode('utf-8'))
        except RecursionError:
            raise ValueError('Request JSON is nested too deeply.') from None
        if not isinstance(body, dict):
            raise ValueError('Request must be a JSON object.')
        pending = [body]
        try:
            while pending:
                item = pending.pop()
                if isinstance(item, str):
                    item.encode('utf-8')
                elif isinstance(item, dict):
                    pending.extend(item.keys())
                    pending.extend(item.values())
                elif isinstance(item, list):
                    pending.extend(item)
        except UnicodeError:
            raise ValueError('Request text contains an invalid Unicode character.') from None
        for field in text_fields:
            if not isinstance(body.get(field, ''), str):
                raise ValueError(f'{field} must be text.')
        return body

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        local_only = parsed_path.path in ('/api/dictionary', '/api/translate', '/api/subtitles', '/api/subtitles/auto')
        if not self.origin_allowed(local_only):
            self.send_json_response(403, {"status": "error", "message": "Origin is not allowed."})
            return

        if parsed_path.path in ("/api/dictionary", "/api/translate"):
            try:
                translating_sentence = parsed_path.path == "/api/translate"
                max_bytes = 65536 if translating_sentence else 4096
                body = self.read_json_object(max_bytes)
                if translating_sentence:
                    translation = google_translate(body.get('sentence'))
                    self.send_json_response(200, {"status": "success", "translation": translation})
                else:
                    meaning = lookup_google_word(body.get('word'))
                    self.send_json_response(200, {"status": "success", "meaning": meaning})
            except (ValueError, UnicodeError) as error:
                self.send_json_response(400, {"status": "error", "message": str(error)})
            except LookupError as error:
                self.send_json_response(502, {"status": "error", "message": str(error)})
            return

        if parsed_path.path in ("/api/subtitles", "/api/subtitles/auto"):
            try:
                body = self.read_json_object(4096)
                result = automatic_subtitle(body) if parsed_path.path.endswith("/auto") else saved_subtitles(body)
                self.send_json_response(200, {"status": "success", **result})
            except ValueError as error:
                self.send_json_response(400, {"status": "error", "message": str(error)})
            except OSError:
                self.send_json_response(404, {"status": "error", "message": "Saved subtitle or folder unavailable. Refresh the list or choose another file."})
            return

        if parsed_path.path == "/api/parse":
            try:
                body = self.read_json_object(65536)
                tokens = parse_japanese(body.get("text"))
                self.send_json_response(200, {"status": "success", "engine": "sudachi", "tokens": tokens})
            except (ValueError, UnicodeError) as error:
                self.send_json_response(400, {"status": "error", "message": str(error)})
            except ParserUnavailable as error:
                self.send_json_response(503, {"status": "error", "message": str(error)})
            except Exception:
                self.send_json_response(500, {"status": "error", "message": "Japanese parsing failed"})
            return

        # ── POST /api/ai/chat ──
        if parsed_path.path == "/api/ai/chat":
            try:
                body = self.read_json_object(1048576)
                messages = body.get("messages")
                if not isinstance(messages, list) or not messages or not all(
                    isinstance(message, dict) and message.get("role") in ("system", "user", "assistant")
                    and isinstance(message.get("content"), str) and message["content"].strip()
                    for message in messages
                ) or messages[-1]["role"] != "user":
                    raise ValueError("Chat messages must end with a nonempty user question and use valid roles")
                context = [body.get(key, "") for key in ("word", "sentence", "romaji")]
                if not all(isinstance(value, str) for value in context):
                    raise ValueError("Word, sentence and romaji must be strings")
                provider = configured_ai_provider(body.get("provider"))
                if provider == "9router":
                    reply = run_router_chat(messages, *context)
                elif provider == "deepseek":
                    reply = run_deepseek_chat(messages, *context, api_key=body.get("apiKey", ""))
                elif provider in ("antigravity", "agy"):
                    reply = run_antigravity_chat(messages, *context)
                else:
                    raise ValueError("Unsupported chat provider. Choose DeepSeek or Antigravity.")
                self.send_json_response(200, {"status": "success", "reply": reply})
            except (ValueError, UnicodeError) as error:
                self.send_json_response(400, {"status": "error", "message": str(error)})
            except subprocess.TimeoutExpired:
                self.send_json_response(504, {"status": "error", "message": f"Antigravity CLI did not finish within {ANTIGRAVITY_TIMEOUT_SECONDS} seconds. Please try again."})
            except Exception as error:
                self.send_json_response(500, {"status": "error", "message": str(error)})
            return

        # ── POST /api/ai/analyze ──
        if parsed_path.path == "/api/ai/analyze":
            try:
                req_json = self.read_json_object(1048576, ('word', 'sentence', 'romaji', 'prompt', 'apiKey'))
                provider = configured_ai_provider(req_json.get("provider"))
            except ValueError as error:
                self.send_json_response(400, {"status": "error", "message": str(error)})
                return
            try:
                word = req_json.get("word", "").strip()
                sentence = req_json.get("sentence", "").strip()
                romaji = req_json.get("romaji", "").strip()
                custom_prompt = req_json.get("prompt", "").strip()
                api_key = req_json.get("apiKey", "").strip()

                if not word and not custom_prompt:
                    self.send_json_response(400, {"status": "error", "message": "Missing 'word' parameter"})
                    return

                # Preserve field boundaries and every input used to build the prompt.
                router_identity = ()
                if provider == "9router":
                    import hashlib
                    router_identity = (hashlib.sha256(json.dumps(router_config()).encode()).hexdigest(),)
                cache_key = (provider, 'prompt', custom_prompt) if custom_prompt else (provider, 'word', word, sentence, romaji)
                cache_key += router_identity
                cached = get_from_cache(ai_analysis_cache, cache_key)
                if cached:
                    print(f"  ⚡ Serving cached AI analysis for '{word or 'custom_prompt'}'")
                    self.send_json_response(200, {"status": "success", "data": cached, "cached": True})
                    return

                if provider == "9router":
                    ai_data = run_router_analysis(word, sentence, romaji, custom_prompt)
                elif provider in ["antigravity", "agy"]:
                    ai_data = run_antigravity_analysis(word, sentence, romaji, custom_prompt)
                elif provider == "deepseek":
                    ai_data = run_deepseek_analysis(word, sentence, romaji, api_key, custom_prompt)
                elif provider in ["gemini", "gemini_api"]:
                    ai_data = run_gemini_api_analysis(word, sentence, romaji, api_key, custom_prompt)
                else:
                    self.send_json_response(400, {"status": "error", "message": f"Unsupported provider: {provider}"})
                    return


                set_in_cache(ai_analysis_cache, cache_key, ai_data)
                self.send_json_response(200, {"status": "success", "data": ai_data, "provider": provider})

            except PromptTooLong as error:
                self.send_json_response(400, {"status": "error", "message": str(error)})
            except subprocess.TimeoutExpired:
                self.send_json_response(504, {"status": "error", "message": f"Antigravity CLI did not finish within {ANTIGRAVITY_TIMEOUT_SECONDS} seconds. Please try again."})
            except Exception as e:
                print(f"  ❌ AI Analysis Error: {e}")
                self.send_json_response(500, {"status": "error", "message": str(e)})
            return

        # ── POST /api/bookmark ──
        if parsed_path.path == "/api/bookmark":
            try:
                card_data = self.read_json_object(1048576, ('sentence', 'word', 'reading', 'meaning'))
            except ValueError as error:
                self.send_json_response(400, {"status": "error", "message": str(error)})
                return
            try:
                sentence, word, reading, meaning = (re.sub(r'[\t\r\n\v\f\x85\u2028\u2029]+', ' ', card_data.get(key, '')).strip()
                                                    for key in ('sentence', 'word', 'reading', 'meaning'))

                if not word:
                    self.send_json_response(400, {"status": "error", "message": "Word field is required"})
                    return

                bold_sentence = (
                    sentence.replace(word, f"<b>{word}</b>")
                    if word and word in sentence
                    else sentence
                )
                if bold_sentence.startswith('#'):
                    bold_sentence = '&#35;' + bold_sentence[1:]

                with file_lock:
                    file_is_empty = not os.path.exists(ANKI_FILE) or os.path.getsize(ANKI_FILE) == 0
                    with open(ANKI_FILE, "a", encoding="utf-8") as f:
                        if file_is_empty:
                            f.write("#separator:Tab\n")
                            f.write("#html:true\n")
                            f.write("#deck:LinguaPlay Japanese Immersion\n")
                        f.write(f"{bold_sentence}\t{word}\t{reading}\t{meaning}\n")

                print(f"  💾 Card Saved to {ANKI_FILE}: {word} -> {meaning[:30]}")
                self.send_json_response(200, {
                    "status": "success",
                    "target": "server_file",
                    "message": "Saved to anki_cards.txt",
                    "file": ANKI_FILE
                })

            except Exception as e:
                self.send_json_response(500, {"status": "error", "message": f"Bookmark error: {str(e)}"})
        else:
            self.send_json_response(404, {"status": "error", "message": "Not Found"})

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path.startswith('/api/') and not self.origin_allowed():
            self.send_json_response(403, {"status": "error", "message": "Origin is not allowed."})
            return

        # ── Root URL Dispatch ──
        if parsed_path.path in ["", "/"]:
            self.path = "/index.html"
            return super().do_GET()

        # ── Favicon ──
        if parsed_path.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        # ── GET /api/ai/status ──
        if parsed_path.path == "/api/ai/status":
            agy_path = find_agy_binary()
            self.send_json_response(200, {
                "status": "success",
                "antigravity_available": agy_path is not None,
                "antigravity_path": agy_path,
                "default_provider": configured_ai_provider(),
                **router_status(),
                "deepseek_configured": bool(os.environ.get("LANGPLAY_DEEPSEEK_API_KEY", "").strip()),
                "deepseek_model": os.environ.get("LANGPLAY_DEEPSEEK_MODEL", "deepseek-flash")
            })
            return

        # ── GET /api/bookmarks ──
        if parsed_path.path == "/api/bookmarks":
            with file_lock:
                count = 0
                if os.path.exists(ANKI_FILE):
                    with open(ANKI_FILE, "r", encoding="utf-8", errors="replace") as f:
                        lines = [line for line in f if line.strip() and not line.startswith("#")]
                        count = len(lines)
            self.send_json_response(200, {"status": "success", "count": count, "file": ANKI_FILE})
            return

        # ── GET /api/captions?v=VIDEO_ID ──
        if parsed_path.path == "/api/captions":
            qs = urllib.parse.parse_qs(parsed_path.query)
            video_id = qs.get("v", [None])[0]
            if not video_id:
                self.send_json_response(400, {"status": "error", "message": "Missing video ID (?v=...)"})
                return

            cached_vtt = get_from_cache(caption_cache, video_id)
            if cached_vtt:
                print(f"  ⚡ Serving cached subtitles for {video_id}")
                self.send_raw_response(200, "text/vtt; charset=utf-8", cached_vtt.encode("utf-8"))
                return

            print(f"  🚀 Extracting subtitles for {video_id} (TVHTML5/InnerTube)...")
            try:
                tracks = get_caption_tracks_backend(video_id)
                track = pick_track_backend(tracks, "ja")

                if track and "baseUrl" in track:
                    base_url = track["baseUrl"]
                    sep = "&" if ("?" in base_url or "&" in base_url) else "?"
                    url = base_url + ("" if "fmt=" in base_url else f"{sep}fmt=vtt")

                    vtt_data = http_get_backend(url, timeout=8)
                    if vtt_data and vtt_data.strip():
                        final_vtt = vtt_data if vtt_data.lstrip().startswith("WEBVTT") else "WEBVTT\n\n" + vtt_data
                        set_in_cache(caption_cache, video_id, final_vtt)
                        self.send_raw_response(200, "text/vtt; charset=utf-8", final_vtt.encode("utf-8"))
                        print(f"  ✅ Fast subtitle extract succeeded for {video_id}")
                        return
            except Exception as e:
                print(f"  ⚠️ Fast extractor hit wall: {e}")

            print(f"  ⏳ Subprocess yt-dlp fallback for {video_id}...")
            try:
                with tempfile.TemporaryDirectory() as tmpdir:
                    url = f"https://www.youtube.com/watch?v={video_id}"
                    out_tmpl = os.path.join(tmpdir, "%(id)s.%(ext)s")
                    cmd = [
                        sys.executable, "-m", "yt_dlp",
                        "--no-playlist", "--skip-download",
                        "--write-subs", "--write-auto-subs",
                        "--sub-langs", "ja", "--convert-subs", "vtt",
                        "-o", out_tmpl, url
                    ]
                    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=18)
                    vtt_files = glob.glob(os.path.join(tmpdir, "*.vtt"))

                    if not vtt_files:
                        self.send_json_response(404, {
                            "status": "error",
                            "message": f"Subtitle extraction failed. No subtitles returned by yt-dlp.\n{result.stderr[:200]}"
                        })
                        return

                    with open(vtt_files[0], "r", encoding="utf-8") as f:
                        vtt_data = f.read()

                    set_in_cache(caption_cache, video_id, vtt_data)
                    self.send_raw_response(200, "text/vtt; charset=utf-8", vtt_data.encode("utf-8"))
                    return
            except subprocess.TimeoutExpired:
                print(f"  ⚠️ yt-dlp timed out for {video_id}")
                self.send_json_response(504, {"status": "error", "message": "yt-dlp subtitle extraction timed out."})
                return
            except Exception as e:
                print(f"  ⚠️ yt-dlp fallback failed: {e}")
                self.send_json_response(500, {"status": "error", "message": f"yt-dlp execution error: {str(e)}"})
                return

        # ── GET /api/search?q=QUERY ──
        elif parsed_path.path == "/api/search":
            qs = urllib.parse.parse_qs(parsed_path.query)
            query = qs.get("q", [""])[0].strip()
            if not query:
                self.send_json_response(400, {"status": "error", "message": "Missing search query (?q=...)"})
                return

            cached_results = get_from_cache(search_cache, query)
            if cached_results is not None:
                self.send_json_response(200, cached_results)
                return

            is_url = query.startswith("http://") or query.startswith("https://")
            target = query if is_url else f"ytsearch15:{query}"

            cmd = [sys.executable, "-m", "yt_dlp", target, "--dump-json", "--flat-playlist"]
            if is_url:
                cmd.extend(["--playlist-end", "20"])

            print(f"  🔍 Searching YouTube for: {query[:40]}...")
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15)
                videos = []
                for line in result.stdout.strip().split("\n"):
                    if line:
                        try:
                            item = json.loads(line)
                            videos.append(item)
                        except Exception:
                            pass

                set_in_cache(search_cache, query, videos)
                self.send_json_response(200, videos)
            except subprocess.TimeoutExpired:
                self.send_json_response(504, {"status": "error", "message": "Search request timed out"})
            except Exception as e:
                self.send_json_response(500, {"status": "error", "message": f"Search error: {str(e)}"})

        # ── GET /api/stream?v=VIDEO_ID ──
        elif parsed_path.path == "/api/stream":
            qs = urllib.parse.parse_qs(parsed_path.query)
            video_id = qs.get("v", [None])[0]
            if not video_id:
                self.send_json_response(400, {"status": "error", "message": "Missing video ID (?v=...)"})
                return

            cached_stream = get_from_cache(stream_cache, video_id)
            if cached_stream:
                self.send_json_response(200, {"url": cached_stream})
                return

            cmd = [sys.executable, "-m", "yt_dlp", "-f", "b", "-g", f"https://www.youtube.com/watch?v={video_id}"]
            print(f"  🎬 Extracting stream URL for {video_id}...")
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15)
                stream_url = result.stdout.strip()
                if not stream_url:
                    self.send_json_response(404, {"status": "error", "message": "Could not extract stream URL"})
                    return

                set_in_cache(stream_cache, video_id, stream_url)
                self.send_json_response(200, {"url": stream_url})
            except subprocess.TimeoutExpired:
                self.send_json_response(504, {"status": "error", "message": "Stream extraction timed out"})
            except Exception as e:
                self.send_json_response(500, {"status": "error", "message": f"Stream error: {str(e)}"})

        # ── Static File Handler ──
        else:
            super().do_GET()


class LangPlayHTTPServer(http.server.ThreadingHTTPServer):
    """Bound active clients as well as the time allowed to receive a request."""
    max_workers = 32
    allow_reuse_address = True

    def __init__(self, *args, **kwargs):
        self._request_slots = threading.BoundedSemaphore(self.max_workers)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self._request_slots.acquire(blocking=False):
            try:
                request.settimeout(1)
                request.sendall(b'HTTP/1.0 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._request_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()


def is_port_available(host, port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            return True
        except socket.error:
            return False


def get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def main():
    parser = argparse.ArgumentParser(description="LinguaPlay Multithreaded Immersion Server")
    parser.add_argument("-p", "--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("-H", "--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1; use 0.0.0.0 for trusted LAN access)")
    parser.add_argument("--open", action="store_true", help="Automatically open browser on startup")
    args = parser.parse_args()

    port = args.port
    host = args.host

    if not is_port_available(host, port):
        print(f"⚠️ Port {port} is already in use on {host}.")
        found_port = False
        for alt_port in range(port + 1, port + 20):
            if is_port_available(host, alt_port):
                print(f"  -> Switching to next available port: {alt_port}")
                port = alt_port
                found_port = True
                break
        if not found_port:
            print(f"❌ Error: Could not find an open port starting from {port}. Exiting.")
            sys.exit(1)

    server_address = (host, port)
    httpd = LangPlayHTTPServer(server_address, RequestHandler)

    local_ip = get_local_ip()
    agy_detected = find_agy_binary()
    print("=" * 64)
    print(" 🚀 LinguaPlay Multithreaded Server Online & Synced!")
    print(f" -> Localhost URL  : http://127.0.0.1:{port}/")
    print(f" -> Network LAN URL: http://{local_ip}:{port}/ (Enter this on other devices)")
    print(f" -> Local Cards TSV: {ANKI_FILE}")
    print(f" -> Antigravity CLI: {'✅ ' + agy_detected if agy_detected else '❌ Not found'}")
    print("=" * 64)

    if args.open:
        threading.Timer(0.6, lambda: webbrowser.open(f"http://127.0.0.1:{port}/")).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Shutting down LinguaPlay server gracefully.")
        httpd.server_close()


if __name__ == "__main__":
    main()
