# Japanese subtitle playback check

17 October 2026, Asia/Jakarta.

## Integrated Jimaku check — subsequently verified

The user supplied a Jimaku API key. Authentication returned HTTP 200 and the episode-filtered API returned seven candidates for Re:Zero season 4, episode 1. Saved the key in Subtitle Engine's normal local preferences; it is deliberately omitted from this document and the test evidence.

Verified Subtitle Engine's **Jimaku (Integrated)** source inside Seanime's browser player: it displayed seven results, and selecting the Amazon Japanese SRT changed its button to **Added**. The plugin needs an entry-page navigation event after its preferences/runtime reload; navigating to Search and back to the anime restored active-session detection.

The browser's libass renderer initially displayed missing-character boxes. Its default renderer only loaded Roboto. Copied the existing system font `/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc` into Seanime's supported assets directory as `/home/marsel/.config/Seanime/assets/Noto Sans CJK JP.ttc`. In the player selected **Settings → Subtitle Styles → On → Font**, entered `Noto Sans CJK JP.ttc`, and saved. Seanime served the font successfully and Japanese captions became visibly readable during 1920×1080 playback.

The integrated browser workflow is now verified for this episode. Source remains Jimaku (Integrated), format All, language Japanese, and automatic selection None. Full-episode timing, native Denshi rendering, and LangPlay word lookup remain unverified.

Repeat: open an episode in the built-in player → open the plugin tray → Subtitle Engine → choose a matching Japanese subtitle with **Select**. If the plugin reports no active session immediately after changing preferences, navigate away from the anime and reopen it.

- [Integrated Japanese playback screenshot](jimaku-seanime-japanese-playback-2026-10-17.png).
- [Jimaku results screenshot](jimaku-integrated-results-2026-10-17.png).

## Earlier manual mpv check

Opened **Re:Zero season 4, episode 1** (AniList 189046) through the existing AniPM source in a separate system mpv window, with a Japanese subtitle file downloaded from [Jimaku entry 11820](https://jimaku.cc/entry/11820).

Verified a 1920×1080 video track and the selected external Japanese SubRip track (subtitle ID 2). At 27 seconds mpv returned Japanese dialogue through `sub-text`; its screenshot visibly includes the Japanese subtitle. Playback was then resumed. This is a single-episode check, not a full timing/alignment audit.

- [Playback screenshot](rezero-japanese-playback-2026-10-17.png).
- Saved subtitle: `/home/marsel/.local/share/langplay-seanime/subtitles/ReZero.S04E01.ja.srt`.
- The adjacent `.source.json` records the original Amazon Japanese SDH filename and download URL.
- Private playback session details and mpv log: `/home/marsel/.local/share/langplay-seanime/provider-check-2026-10-17/`.

Also installed Subtitle Engine 1.1.2 from Thekingcrusher's repository and completed its normal playback/network permission flow in Seanime. Its key-free Jimaku/Wyzie search returned zero results for TMDB 65942, season 4, episode 1. Public Jimaku browsing nevertheless exposed the matching subtitle, which was downloaded directly without an API key.

At the end of the earlier manual check, Subtitle Engine was configured for **Jimaku (Integrated)**, Japanese, all formats, and no automatic selection, with no API key yet supplied. The subsequent integrated check above supersedes that limitation for browser playback. Seanime's default player settings were not changed.
