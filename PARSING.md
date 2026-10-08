# Japanese parsing

`POST /api/parse` accepts `{"text":"彼はまだ来ない。"}` and returns offline
Sudachi tokens, readings, dictionary forms, POS, conjugation and UTF-16 offsets.
Verb endings are joined for learner clicks; `morphemes` retains the raw analysis.
Results are bounded to 256 cached lines; concurrent requests use separate tokenizers.

Install once in a dedicated environment:

```sh
uv venv --python 3.14 .venv
uv pip install --python .venv/bin/python -r requirements-parser.txt
.venv/bin/python Server.py --host 127.0.0.1 --port 8000
```

The extension's native launcher prefers `.venv/bin/python` beside `Server.py`.
Existing AI/translation endpoints and credentials are unaffected. Without parser
dependencies, the server still starts and `/api/parse` returns HTTP 503; the
extension keeps its fallback readings and retries later. Older servers returning
404 are handled the same way.

On the tested i5/8 GB machine parsing took approximately 0.03 ms per short line,
plus localhost transport, and about 124 MiB total parser-process peak RSS. The
Core dictionary takes about 207 MiB on disk. Ambiguous readings and fictional
names can still require correction; this is morphology, not scene understanding.

SudachiPy and SudachiDict are distributed under Apache-2.0 with bundled third-party
notices. Preserve package license/LEGAL files when redistributing the dependencies:
[engine](https://github.com/WorksApplications/sudachi.rs),
[dictionary](https://github.com/WorksApplications/SudachiDict).
