# Setup verification

Local Linux checks performed on 2026-10-15:

- 20 installer unit checks passed.
- Existing regressions: 22 Python, 82 Node and 33 Seanime integration checks passed.
- Both Windows vendor packages matched pinned GitHub asset hashes. Their nested
  NSIS payloads extracted successfully; desktop/server/downloader binaries exist.
- Real Linux package extraction, fresh profile initialization, qBittorrent login,
  category/save path, empty torrent queue, source-provider loading, automatic
  download defaults and repeat installation passed using an isolated backend port.
- The standalone Linux binary parsed Japanese with bundled Sudachi and served
  its companion health/parse API from outside the source directory.
- The native window source passed the mechanical design detector. Visual review
  is pending native Linux/Windows captures; this is a self-review, not independent
  design approval. Native automation/capture is unavailable in this session.

The GitHub workflow additionally builds each OS's actual executable, tests the
frozen installer, verifies its installed runtime and shortcut, and runs real
package installation/rerun checks. Its results, rather than the local Windows
layout inspection, determine Windows runtime verification. No episode download,
account login or native playback is part of the installer checks.

The earlier repository browser smoke limitation remains outside this installer:
the existing runner loads the root rather than the browser extension directory.
No browser-extension runner, test or production learning code was changed here.
