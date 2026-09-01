#!/usr/bin/env python3
"""
LinguaPlay — Multithreaded Backend Server (Server.py)
Standard-library based ThreadingHTTPServer providing non-blocking request handling,
YouTube caption/search/stream extraction with caching and timeouts, local Anki bookmarking,
and native Antigravity CLI / Gemini AI linguistic analysis.
"""

import argparse
import glob
import http.server
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
import urllib.parse
import urllib.request
import webbrowser

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
ai_analysis_cache = {} # (word, sentence) -> (timestamp, parsed_json)
CACHE_TTL = 3600     # 1 hour


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


def run_antigravity_analysis(word, sentence, romaji=""):
    agy_bin = find_agy_binary()
    if not agy_bin:
        raise RuntimeError("Antigravity CLI ('agy') not found in PATH or ~/.local/bin/agy")

    prompt = build_ai_prompt(word, sentence, romaji)
    cmd = [agy_bin, "--print", prompt]

    print(f"  🤖 Running Antigravity CLI for: '{word}'...")
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30)

    if result.returncode != 0:
        err_msg = result.stderr.strip() or f"Process exited with code {result.returncode}"
        raise RuntimeError(f"Antigravity CLI error: {err_msg}")

    stdout = result.stdout.strip()
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


def run_gemini_api_analysis(word, sentence, romaji, api_key):
    if not api_key or not api_key.strip():
        raise ValueError("Missing Gemini API key")

    prompt = build_ai_prompt(word, sentence, romaji)
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
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

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
        self.send_response(200, "OK")
        self.send_cors_headers()
        self.end_headers()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)

        # ── POST /api/ai/analyze ──
        if parsed_path.path == "/api/ai/analyze":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_data = self.rfile.read(content_length)
                req_json = json.loads(post_data.decode("utf-8"))

                word = req_json.get("word", "").strip()
                sentence = req_json.get("sentence", "").strip()
                romaji = req_json.get("romaji", "").strip()
                provider = req_json.get("provider", "antigravity").lower()
                api_key = req_json.get("apiKey", "").strip()

                if not word:
                    self.send_json_response(400, {"status": "error", "message": "Missing 'word' parameter"})
                    return

                # Check cache (v5 compact horizontal gloss format)
                cache_key = f"v5:{provider}:{word}:{sentence}"
                cached = get_from_cache(ai_analysis_cache, cache_key)
                if cached:
                    print(f"  ⚡ Serving cached AI analysis for '{word}'")
                    self.send_json_response(200, {"status": "success", "data": cached, "cached": True})
                    return

                if provider in ["antigravity", "agy"]:
                    ai_data = run_antigravity_analysis(word, sentence, romaji)
                elif provider in ["gemini", "gemini_api"]:
                    ai_data = run_gemini_api_analysis(word, sentence, romaji, api_key)
                else:
                    self.send_json_response(400, {"status": "error", "message": f"Unsupported provider: {provider}"})
                    return

                set_in_cache(ai_analysis_cache, cache_key, ai_data)
                self.send_json_response(200, {"status": "success", "data": ai_data, "provider": provider})

            except subprocess.TimeoutExpired:
                self.send_json_response(504, {"status": "error", "message": "Antigravity CLI execution timed out."})
            except Exception as e:
                print(f"  ❌ AI Analysis Error: {e}")
                self.send_json_response(500, {"status": "error", "message": str(e)})
            return

        # ── POST /api/bookmark ──
        if parsed_path.path == "/api/bookmark":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length == 0:
                    self.send_json_response(400, {"status": "error", "message": "Missing request body"})
                    return

                post_data = self.rfile.read(content_length)
                card_data = json.loads(post_data.decode("utf-8"))

                sentence = card_data.get("sentence", "").replace("\t", " ").replace("\n", " ").strip()
                word = card_data.get("word", "").replace("\t", " ").replace("\n", " ").strip()
                reading = card_data.get("reading", "").replace("\t", " ").replace("\n", " ").strip()
                meaning = card_data.get("meaning", "").replace("\t", " ").replace("\n", " ").strip()

                if not word:
                    self.send_json_response(400, {"status": "error", "message": "Word field is required"})
                    return

                bold_sentence = (
                    sentence.replace(word, f"<b>{word}</b>")
                    if word and word in sentence
                    else sentence
                )

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
                "default_provider": "antigravity" if agy_path else "gemini"
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


def is_port_available(host, port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            return True
        except socket.error:
            return False


def main():
    parser = argparse.ArgumentParser(description="LinguaPlay Multithreaded Immersion Server")
    parser.add_argument("-p", "--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("-H", "--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
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
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    httpd = http.server.ThreadingHTTPServer(server_address, RequestHandler)

    app_url = f"http://{host}:{port}/"
    agy_detected = find_agy_binary()
    print("=" * 64)
    print(" 🚀 LinguaPlay Multithreaded Server Online & Synced!")
    print(f" -> Access Web App : {app_url}")
    print(f" -> Local Cards TSV: {ANKI_FILE}")
    print(f" -> Antigravity CLI: {'✅ ' + agy_detected if agy_detected else '❌ Not found'}")
    print("=" * 64)

    if args.open:
        threading.Timer(0.6, lambda: webbrowser.open(app_url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Shutting down LinguaPlay server gracefully.")
        httpd.server_close()


if __name__ == "__main__":
    main()