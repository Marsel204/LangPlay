# Online streaming provider installation and checks

Date: 17 October 2026, Asia/Jakarta. Host: the existing Seanime Denshi 3.10.4 installation on Linux.

After testing, the user requested removal of the unsuccessful providers. Uninstalled Anicrush, Animo, AniNeko, AniWatch, HiAnime, Senshi, and Sudatchi through Seanime's extension API. Verified that only **AniPM** and **KickAssAnime** remain registered as online streaming providers, with **AnimeTosho** and the **LangPlay probe** retained. Copies of removed manifests and the uninstall results are in the private evidence directory below. The table records the earlier tests, including providers subsequently removed.

Installed all nine providers from [Thekingcrusher/online-stream-providers](https://github.com/Thekingcrusher/online-stream-providers) through Seanime's extension installation API. Enabled `library.enableOnlinestream` through the supported setting API. Seanime's runtime registry and Extensions page both confirmed all nine installed. Existing AnimeTosho and LangPlay probe remain installed.

## Observed results

Test title: **Frieren: Beyond Journey’s End**, AniList ID 154587, original audio/sub route. Episode 1 was tested whenever episode discovery succeeded. Results apply to this title and this network during this run; they do not establish availability for every title, episode, mirror, or dub.

| Provider | Installed version | Episode discovery | Stream/playback result |
| --- | --- | --- | --- |
| Anicrush | 1.1.2 | No matches | Direct diagnostic request to its API returned HTTP 521, with a response reporting that the origin server was down. |
| Animo | 1.0.2 | Client request timed out at 35 seconds | Independent API probe also timed out. No playback verified. |
| AniNeko | 1.0.0 | No episodes | Seanime logged rejected search promises for both Japanese romanized and English titles. No playback verified. |
| AniPM | 1.0.0 | 28 episodes | Two stream sources returned. Three seconds decoded successfully with FFmpeg. Seanime's browser player displayed video, advanced playback to 28.57 seconds, and reported 1920×1080, readyState 4, with no media error. |
| AniWatch | 1.0.0 | No episodes | Seanime logged rejected search promises. No playback verified. |
| HiAnime | 1.1.3 | Client request timed out at 35 seconds | Default domain failed to complete discovery within the test deadline. Other configured mirrors were not tested. |
| KickAssAnime | 1.0.8 | 28 episodes | One stream source returned. Seanime's browser player displayed video and advanced from 28.59 to 38.98 seconds at 640×360 with readyState 4 and no media error. |
| Senshi | 1.1.0 | 28 episodes | Episode 1 source lookup failed: `no episode servers found, provider returned: 'no source found for episode'`. |
| Sudatchi | 1.0.3 | No episodes after 20.6 seconds | No playback verified. Its search implementation synthesizes a result from AniList identity, so an apparent search match alone does not establish that the title exists upstream. |

KickAssAnime initially failed the standalone FFmpeg check because its HLS playlist uses segment filenames ending in `.jpg`, which the installed FFmpeg rejects by default. Successful playback in Seanime's browser player supersedes that test-tool failure. No FFmpeg security flags or application source were changed.

## Usable route

Open an anime → **Online streaming** → **AniPM** → **AniPM (Soft)**. KickAssAnime / VidStreaming is a second observed working option. These two providers remain installed after cleanup. AniPM was selected in the browser test and playback was paused afterward.

These are browser-player observations against the installed Seanime server. Native Denshi player behavior, full-episode playback, seeking, every stream quality, dub availability, and LangPlay's unfinished native learning integration were not validated by this run.

Neither AniPM nor KickAssAnime returned a Japanese subtitle track for the tested episode. Their returned tracks included English and several other languages. Working video does not establish Japanese subtitle availability or selectable LangPlay learning text.

## Evidence and recovery

- [Installed providers screenshot](online-providers-installed-2026-10-17.png).
- [AniPM playback screenshot](anipm-playback-2026-10-17.png).
- [KickAssAnime playback screenshot](kickassanime-playback-2026-10-17.png).
- Private local installation results, bounded API test results, source responses, and a pre-install SQLite backup: `/home/marsel/.local/share/langplay-seanime/provider-check-2026-10-17/`. Do not commit the database or source-response files; they can contain credentials or expiring playback tokens.
- Before installation, backed up the running database using SQLite's backup API and copied the existing extension files. No running database was edited directly.
- To remove a provider, use its menu in Extensions. To turn the feature off, disable online streaming in Seanime settings. Existing torrent settings were not changed. The temporary browser tests may create ordinary local resume state; they did not play an episode to completion.
