# Bundled code and downloaded applications

The setup binary includes the Python runtime, Tk/Tcl, PyInstaller's bootloader,
SudachiPy 0.6.11, SudachiDict-core 20250129 and LangPlay's existing companion.
The build collects the Python packages' metadata/data with `--collect-all`.
Copies of the Python, Tcl/Tk, Apache-2.0 and PyInstaller license texts are included
under `installer/licenses` inside the executable. The release workflow also
uploads this notice and the exact LangPlay source archive beside its artifacts.

- Python: https://www.python.org/psf/license/
- Tcl/Tk: https://www.tcl-lang.org/software/tcltk/license.html
- PyInstaller (GPL with bootloader exception): https://github.com/pyinstaller/pyinstaller
- SudachiPy (Apache-2.0): https://github.com/WorksApplications/SudachiPy
- SudachiDict (Apache-2.0; additional dictionary notices in its package): https://github.com/WorksApplications/SudachiDict
- Windows builds include the GitHub runner's 7-Zip `7z.exe`, `7z.dll`, and
  `License.txt` to unpack official NSIS installers without elevation. 7-Zip is
  LGPL with additional unRAR restrictions: https://www.7-zip.org/license.txt
  Source: https://www.7-zip.org/download.html

Seanime 3.10.4 and qBittorrent 5.2.4 are downloaded directly from their official
GitHub releases and verified against committed SHA256 hashes. Their license
files remain in the extracted applications. They are not included in the
LangPlay setup download.

- Seanime, GPL-3.0: https://github.com/5rahim/seanime/tree/v3.10.4
- qBittorrent, GPL-2.0-or-later with OpenSSL exception:
  https://github.com/qbittorrent/qBittorrent/tree/release-5.2.4

The optional-to-use AnimeTosho community provider is downloaded separately from
a pinned source commit, checked against committed hashes, and installed with
its original manifest metadata. Its code is not bundled in the setup executable:
https://github.com/faddix/seanime-animetosho-new/tree/592623491dd37c7080db2abe13e8efbe3a34dbfe

Provider availability and the user's access to any particular media are outside
the installer. Setup never searches for or downloads anime episodes.
