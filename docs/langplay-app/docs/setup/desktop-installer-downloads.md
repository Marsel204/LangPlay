# Seanime + LangPlay installers

Both platform builds passed the full CI workflow on source commit `8476edf0d68d542d6d5344c655ebc187c0ec7049`.

- [Windows x64 package](https://github.com/Marsel204/LangPlay/actions/runs/38712940993/artifacts/11961652452)
- [Linux x64 package](https://github.com/Marsel204/LangPlay/actions/runs/38712940993/artifacts/11961123775)
- [Passed build and checks](https://github.com/Marsel204/LangPlay/actions/runs/38712940993)
- [Draft PR #2](https://github.com/Marsel204/LangPlay/pull/2)

Download the appropriate artifact while signed into GitHub, then extract it. On Windows, open `LangPlay-Setup-Windows-x64.exe`. On Linux, extract the included `LangPlay-Setup-Linux-x86_64.tar.gz` and open the executable inside. Choose the library folder, click Install, then Launch Seanime. Future launches use Seanime + LangPlay in the app menu.

No separate Python or Node installation is needed. Setup downloads the official apps, verifies their hashes, and creates fresh device-local credentials. Quit an already-running Seanime through its tray before starting. Enable the LangPlay development probe once under Extensions → Grant. Automatic downloads remain off until you choose shows and rules. The full subtitle-learning UI is still unfinished. These are unsigned preview installers; native visual review remains pending hands-on captures.

GitHub Actions retains these artifacts for 30 days. The source/build workflow remains in the repo for rebuilding. The optional local transfer was stopped because the artifact CDN download was slow; use the links directly on the other device.
