import base64
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from installer import core


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="langplay setup '")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def state(self, **changes):
        return dict(system="linux", library=str(self.root / "Anime library"),
                    qbittorrent="/private/qbit", qbitPort=8082, qbitPassword="fresh-random", **changes)

    def test_private_atomic_state_and_fresh_password_hash(self):
        core.save_json(self.root / "installation.json", {"secret": "not-for-logs"})
        self.assertEqual(core.read_json(self.root / "installation.json")["secret"], "not-for-logs")
        if os.name != "nt":
            self.assertEqual((self.root / "installation.json").stat().st_mode & 0o777, 0o600)
        state = self.state()
        core.write_qbit_config(self.root, state)
        conf = self.root / "qbittorrent/qBittorrent/config/qBittorrent.conf"
        data = conf.read_text()
        self.assertNotIn(state["qbitPassword"], data)
        encoded = data.split('@ByteArray(')[1].split(')')[0]
        salt, value = map(base64.b64decode, encoded.split(":"))
        self.assertEqual(value, hashlib.pbkdf2_hmac("sha512", state["qbitPassword"].encode(), salt, 100000, 64))
        self.assertIn("WebUI\\LocalHostAuth=true", data)
        self.assertIn("WebUI\\Address=127.0.0.1", data)

    def test_rerun_does_not_rotate_credentials_or_overwrite_qbit_preferences(self):
        state = self.state()
        core.write_qbit_config(self.root, state)
        conf = self.root / "qbittorrent/qBittorrent/config/qBittorrent.conf"
        before = conf.read_bytes()
        state["qbitPassword"] = "different"
        core.write_qbit_config(self.root, state)
        self.assertEqual(conf.read_bytes(), before)

    def test_windows_custom_profile_uses_ini(self):
        state = self.state(); state["system"] = "windows"
        core.write_qbit_config(self.root, state)
        self.assertTrue((self.root / "qbittorrent/qBittorrent/config/qBittorrent.ini").exists())

    def test_download_integrity_failure_does_not_promote_partial_file(self):
        class Response(io.BytesIO):
            url = "https://official.example/file"
        asset = {"url": "https://official.example/file", "sha256": "0" * 64}
        with patch.object(core.urllib.request, "urlopen", return_value=Response(b"tampered")):
            with self.assertRaisesRegex(core.SetupError, "verification"):
                core.fetch(asset, self.root, log=lambda _: None)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_verified_cache_works_offline_but_corrupt_cache_does_not(self):
        content = b"official package"
        asset = {"url": "https://official.example/app", "sha256": hashlib.sha256(content).hexdigest()}
        target = self.root / (asset["sha256"] + "-app")
        target.write_bytes(content)
        with patch.object(core.urllib.request, "urlopen", side_effect=OSError("offline")):
            self.assertEqual(core.fetch(asset, self.root, lambda _: None), target)
            target.write_bytes(b"corrupted")
            with self.assertRaises(OSError):
                core.fetch(asset, self.root, lambda _: None)

    def test_other_profile_is_rejected_before_install_changes(self):
        class API:
            def call(self, *_args, **_kwargs):
                return {"dataDir": str(self_profile)}
        self_profile = self.root / "other-existing-profile"
        target = self.root / "new-install"
        with patch.object(core, "port_busy", return_value=True):
            with self.assertRaisesRegex(core.SetupError, "Another Seanime"):
                core.Installer(target, api=API()).install(self.root / "Anime")
        self.assertFalse(target.exists())

    def test_api_uses_the_selected_backend_port(self):
        with patch.object(core, "BACKEND_PORT", 43455):
            self.assertEqual(core.SeanimeAPI().base, "http://127.0.0.1:43455")

    def test_same_profile_is_allowed(self):
        class API:
            def call(_, *args, **kwargs):
                return {"dataDir": str(self.root / "seanime")}
        self.assertEqual(core.assert_host_owner(API(), self.root / "seanime")["dataDir"], str(self.root / "seanime"))

    def test_unmanaged_install_folder_is_preserved(self):
        unrelated = self.root / "important.txt"
        unrelated.write_text("keep me")
        with patch.object(core, "port_busy", return_value=False):
            with self.assertRaisesRegex(core.SetupError, "unrelated files"):
                core.Installer(self.root).install(self.root / "Anime")
        self.assertEqual(unrelated.read_text(), "keep me")
        self.assertFalse((self.root / "setup.lock").exists())

    def test_rerun_never_reinitializes_user_library_or_auto_download_rules(self):
        calls = []
        profile = self.root / "seanime"
        class API:
            def call(_, path, data=None, method=None, **kwargs):
                calls.append((path, data, method))
                if path == "status":
                    return {"dataDir": str(profile), "settings": {"id": 1, "autoDownloader": {"enabled": True}}}
                if path.startswith("extensions/user-config/"):
                    return {"savedUserConfig": {"values": {"maxPages": "1"}}}
                raise AssertionError("Existing user settings must not be mutated: " + path)
        core.configure_host(API(), self.root, self.state())
        self.assertEqual(len(calls), 2)

    def test_first_install_disables_auto_downloads_and_creates_stream_cache_settings(self):
        calls = []
        profile = self.root / "seanime"
        class API:
            def call(_, path, data=None, method=None, **kwargs):
                calls.append((path, data, method))
                if path == "status": return {"dataDir": str(profile), "settings": None}
                if path == "torrentstream/settings" and data is None: return {"enabled": False}
                return None
        core.configure_host(API(), self.root, self.state())
        by_path = {p: d for p, d, _ in calls if d is not None}
        self.assertFalse(by_path["settings/auto-downloader"]["enabled"])
        self.assertFalse(by_path["settings/auto-downloader"]["downloadAutomatically"])
        self.assertEqual(by_path["start"]["torrent"]["qbittorrentCategory"], "Anime")
        self.assertEqual(by_path["torrentstream/settings"]["settings"]["preferredResolution"], "1080")

    def test_process_environment_preserves_original_libraries_and_is_loopback_only(self):
        with patch.dict(os.environ, {"LD_LIBRARY_PATH": "/tmp/frozen", "LD_LIBRARY_PATH_ORIG": "/usr/local/lib"}):
            env = core.runtime_environment(self.root)
        self.assertEqual(env["SEANIME_SERVER_HOST"], "127.0.0.1")
        self.assertEqual(env["QBT_PROFILE"], str(self.root / "qbittorrent"))
        if os.name != "nt": self.assertEqual(env["LD_LIBRARY_PATH"], "/usr/local/lib")

    def test_foreign_companion_is_rejected(self):
        response = io.BytesIO(json.dumps({"application": "unrelated"}).encode())
        with patch.object(core.urllib.request, "urlopen", return_value=response):
            with self.assertRaisesRegex(core.SetupError, "another application"):
                core.check_companion(8765, self.root)

    def test_desktop_exec_escapes_spaces_quotes_and_field_codes(self):
        text = core.desktop_exec(["/home/A person/app", "a%f", 'a"b', "a$HOME"])
        self.assertIn('"/home/A person/app"', text)
        self.assertIn('"a%%f"', text)
        self.assertIn('"a\\\\"b"', text)
        self.assertIn('"a\\\\$HOME"', text)

    @unittest.skipIf(os.name == "nt", "Unix flock assertion")
    def test_concurrent_setup_is_blocked_and_lock_released_after_error(self):
        with core.installation_lock(self.root):
            with self.assertRaises(core.SetupError):
                with core.installation_lock(self.root): pass
        with core.installation_lock(self.root): pass

    def test_incomplete_install_cannot_launch(self):
        core.save_json(self.root / "installation.json", {"complete": False})
        with self.assertRaisesRegex(core.SetupError, "incomplete"):
            core.launch(self.root, log=lambda _: None)

    def test_failure_cleans_up_only_spawned_processes(self):
        class Child:
            def __init__(self): self.terminated = False
            def poll(self): return None
            def terminate(self): self.terminated = True
            def wait(self, timeout): return 0
        child = Child(); engine = core.Installer(self.root)
        engine.owned = [child]
        engine.stop_owned()
        self.assertTrue(child.terminated)
        self.assertEqual(engine.owned, [])


if __name__ == "__main__":
    unittest.main()
