#!/usr/bin/env python3
import http.server
import urllib.parse
import subprocess
import tempfile
import os
import glob
import sys
import json
import re
import urllib.request

# --- CONFIGURATION & PATHS ---
ANKI_FILE = "anki_cards.txt"
INNERPLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
CLIENT_CONTEXT = {
    "client": {
        "clientName": "TVHTML5",
        "clientVersion": "7.20240813.07.00",
    }
}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

def http_get_backend(url, headers=None, data=None):
    req_headers = {"User-Agent": UA, "Accept-Language": "ja,en;q=0.8"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read().decode("utf-8", errors="replace")

def get_caption_tracks_backend(video_id):
    """Bypasses PO-tokens using the TVHTML5 client payload or raw page scrape"""
    try:
        payload = json.dumps({"context": CLIENT_CONTEXT, "videoId": video_id}).encode()
        raw = http_get_backend(
            INNERPLAYER_URL,
            headers={"Content-Type": "application/json"},
            data=payload,
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
        print(f"  (InnerTube TV POST failed: {e}; trying structural page scrape)")

    try:
        html = http_get_backend(f"https://www.youtube.com/watch?v={video_id}&hl=ja")
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
                            if esc: esc = False
                            elif c == "\\": esc = True
                            elif c == '"': in_str = False
                        else:
                            if c == '"': in_str = True
                            elif c == "{": depth += 1
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
                                        if tracks: return tracks
                                    except: pass
                                    break
        else:
            try:
                data = json.loads(m.group(1))
                return data.get("captions", {}) .get("playerCaptionsTracklistRenderer", {}).get("captionTracks", [])
            except: pass
    except Exception as e:
        print(f"  (Page scrape extractor failed: {e})")

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
    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type, Accept")
        self.end_headers()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == '/api/bookmark':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                card_data = json.loads(post_data.decode('utf-8'))
                
                # Sanitize text blocks to safeguard tab separation integrity
                sentence = card_data.get('sentence', '').replace('\t', ' ').replace('\n', ' ').strip()
                word = card_data.get('word', '').replace('\t', ' ').replace('\n', ' ').strip()
                reading = card_data.get('reading', '').replace('\t', ' ').replace('\n', ' ').strip()
                meaning = card_data.get('meaning', '').replace('\t', ' ').replace('\n', ' ').strip()
                
                if not sentence or not word:
                    self.send_error(400, "Sentence and Word fields are required.")
                    return
                
                # Highlight the target word for easier identification inside Anki
                bold_sentence = sentence.replace(word, f"<b>{word}</b>") if word in sentence else sentence
                
                # Prepend deck headers dynamically if file is fresh
                file_is_empty = not os.path.exists(ANKI_FILE) or os.path.getsize(ANKI_FILE) == 0

                with open(ANKI_FILE, "a", encoding="utf-8") as f:
                    if file_is_empty:
                        f.write("#separator:Tab\n")
                        f.write("#html:true\n")
                        f.write("#deck:LinguaPlay Japanese Immersion\n") # 👈 Rename your target deck here!
                    
                    f.write(f"{bold_sentence}\t{word}\t{reading}\t{meaning}\n")
                
                print(f"💾 Card Saved: {word} -> {sentence}")
                
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Saved to anki_cards.txt"}).encode('utf-8'))
            except Exception as e:
                self.send_error(500, f"Internal Error: {e}")
        else:
            self.send_error(404)

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == '/api/captions':
            qs = urllib.parse.parse_qs(parsed_path.query)
            video_id = qs.get('v', [None])[0]
            if not video_id:
                self.send_error(400, "Missing video ID")
                return
            
            print(f"🚀 Running instant TVHTML5 pipeline for {video_id}...")
            try:
                tracks = get_caption_tracks_backend(video_id)
                track = pick_track_backend(tracks, "ja")
                
                if track and "baseUrl" in track:
                    base_url = track["baseUrl"]
                    sep = "&" if "?" in base_url or "&" in base_url else "?"
                    url = base_url + ("" if "fmt=" in base_url else f"{sep}fmt=vtt")
                    
                    vtt_data = http_get_backend(url)
                    if vtt_data and vtt_data.strip():
                        final_vtt = vtt_data if vtt_data.lstrip().startswith("WEBVTT") else "WEBVTT\n\n" + vtt_data
                        
                        self.send_response(200)
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Content-Type', 'text/vtt; charset=utf-8')
                        self.end_headers()
                        self.wfile.write(final_vtt.encode('utf-8'))
                        print("✅ Loaded instantly via native script logic!")
                        return
            except Exception as e:
                print(f"⚠️ Native script logic hit an unexpected wall: {e}")

            print("⏳ Falling back to slow yt-dlp pipeline...")
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
                result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
                vtt_files = glob.glob(os.path.join(tmpdir, "*.vtt"))
                
                if not vtt_files:
                    self.send_response(404)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Content-Type', 'text/plain; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(f"Subtitle extraction failed.\n{result.stderr}".encode('utf-8'))
                    return
                
                with open(vtt_files[0], "r", encoding="utf-8") as f:
                    vtt_data = f.read()
                
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'text/vtt; charset=utf-8')
                self.end_headers()
                self.wfile.write(vtt_data.encode('utf-8'))

        elif parsed_path.path == '/api/search':
            qs = urllib.parse.parse_qs(parsed_path.query)
            query = qs.get('q', [''])[0]
            if not query:
                self.send_error(400, "Missing search query")
                return
            
            is_url = query.startswith('http://') or query.startswith('https://')
            target = query if is_url else f"https://www.youtube.com/results?search_query={urllib.parse.quote_plus(query)}"
            
            cmd = [sys.executable, "-m", "yt_dlp", target, "--dump-json", "--flat-playlist"]
            cmd.extend(["--playlist-end", "20"] if is_url else ["--playlist-end", "15"])
            
            print(f"🔍 Searching YouTube for: {query}...")
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            
            videos = []
            for line in result.stdout.strip().split('\n'):
                if line:
                    try: videos.append(json.loads(line))
                    except: pass
            
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(videos).encode('utf-8'))
            
        elif parsed_path.path == '/api/stream':
            qs = urllib.parse.parse_qs(parsed_path.query)
            video_id = qs.get('v', [None])[0]
            if not video_id:
                self.send_error(400, "Missing video ID")
                return
            
            cmd = [sys.executable, "-m", "yt_dlp", "-f", "b", "-g", f"https://www.youtube.com/watch?v={video_id}"]
            print(f"🎬 Extracting stream URL for {video_id}...")
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            
            stream_url = result.stdout.strip()
            if not stream_url:
                self.send_error(404, "Could not extract stream URL")
                return
            
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({"url": stream_url}).encode('utf-8'))
            
        else:
            super().do_GET()

if __name__ == '__main__':
    port = 8000
    server_address = ('127.0.0.1', port)
    http.server.HTTPServer.allow_reuse_address = True
    httpd = http.server.HTTPServer(server_address, RequestHandler)
    print("=" * 60)
    print(f" 🚀 LinguaPlay Hybrid Server Synced & Optimized!")
    print(f" -> Open http://127.0.0.1:{port}/App.html")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")