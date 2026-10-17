# Local playback loading investigation — 2026-10-15

Reported native player stuck at “Loading stream…”. No repository changes.

Evidence:
- Local-file playback requests in the Seanime log took 46–60 seconds.
- Library/episode metadata requests repeatedly took about 30 seconds.
- Reading the first and last MiB of the episode file took 0.0055 seconds.
- Seanime v3.10.4 creates its episode collection before loading local playback;
  that collection requests online metadata synchronously.
- Default metadata endpoint anime.clap.ing failed a bounded 12-second connection
  probe. A separate Python probe failed with network unreachable after 66 seconds.
- The supported fallback endpoint api.ani.zip/v1/episodes returned HTTP 200 in
  1.59 seconds for the same anime.

Applied one runtime setting through Seanime's settings API:
`library.useFallbackMetadataProvider`: false → true.
It was read back as true. No restart, media file, account, or repository changes.

After the change:
- Seanime log confirmed `anizip > Fetching metadata for 124194`.
- Library anime entry returned in 1.176 seconds.
- Episode collection returned in 0.002 seconds.
- Library collection returned in 0.002 seconds.

The actual native playback click was not automated or timed. User should close
and reopen the currently loading episode to verify the player end to end.
This fixes the observed metadata lookup delay; no claim is made about every
possible buffering, decoder, or partially downloaded-file issue.

To revert, disable “Use fallback metadata provider” in Seanime library settings.
