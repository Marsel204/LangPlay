# Desktop setup ship verification — 2026-10-15

Commit: `8476edf0d68d542d6d5344c655ebc187c0ec7049`
Base: `da1e7e0690a00914073f9a8d83512e294c068039` (`origin/main`, fetched today).
Branch: `codex/desktop-setup`. Working tree clean before publishing.
Draft PR: https://github.com/Marsel204/LangPlay/pull/2

## Review

Self-review of the actual feature diff and relevant installer engine, GUI, build,
CI, unit and real-package/frozen smoke sources. No independent review is claimed.
Reviewed integrity-checked package promotion, private profile/credential handling,
foreign service rejection, repeat setup preserving user preferences, lock scope,
startup cleanup of owned processes, installed-runtime launch, and UI worker queues.
No new actionable blocking findings were identified in this review.
Existing companion/parser/browser production sources and test harnesses are unchanged.

## Verification rerun

All commands returned exit code zero using the configured build venv for Python:

- `python -m unittest discover -s installer/tests -p 'test_*.py'`: 20 passed.
- `python -m unittest discover -s tests -p 'test_*.py'`: 22 passed.
- `node --test tests/*.js`: 82 passed.
- `npm --prefix integrations/seanime test`: 33 passed.

Raw local logs are saved in `ship-8476edf-logs/` beside this report.

Exact-head CI: https://github.com/Marsel204/LangPlay/actions/runs/38712940993
The run reports the commit above and both Ubuntu 22.04 and Windows 2022 jobs
succeeded. It verifies real vendor-package installation and rerun, frozen parser
and companion health, the copied installed runtime, and app-menu shortcuts.
A duplicate push run was cancelled by concurrency; the PR run succeeded.
No extra build or CI rerun was needed because the reviewed source did not change.

## Limits

AEK enforcement is absent (`.aek/project.json` is absent); there is no independently
approved harness or enforced restricted publishing identity. This uses the
repository's existing authenticated GitHub workflow.
Native Linux/Windows visual review and end-to-end playback remain unverified.
The existing browser smoke runner has a known extension-directory limitation;
its success is not claimed. No episode download or account login was tested.
The LangPlay extension remains a development probe; full learning functionality
is unfinished. Preview installers are unsigned and x64 only.
The PR stays in draft. No merge, deployment, or public release is authorized here.

## Preview downloads

- Windows: https://github.com/Marsel204/LangPlay/actions/runs/38712940993/artifacts/11961652452
- Linux: https://github.com/Marsel204/LangPlay/actions/runs/38712940993/artifacts/11961123775

GitHub sign-in is required; these CI artifacts have 30-day retention.
