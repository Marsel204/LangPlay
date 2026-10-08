"""Offline Japanese morphology. Dictionary is shared; tokenizers are per thread."""
from functools import lru_cache
import threading


class ParserUnavailable(RuntimeError):
    pass


_dictionary = None
_dictionary_lock = threading.Lock()
_worker = threading.local()


def _tokenizer():
    global _dictionary
    if not hasattr(_worker, 'tokenizer'):
        with _dictionary_lock:
            if _dictionary is None:
                try:
                    from sudachipy import Dictionary
                    _dictionary = Dictionary(dict='core')
                except (ImportError, OSError) as error:
                    raise ParserUnavailable('Install requirements-parser.txt in the server Python environment') from error
        # create() is the pinned 0.6 API. Never share the mutable tokenizer.
        from sudachipy import SplitMode
        _worker.tokenizer = _dictionary.create(mode=SplitMode.B)
    return _worker.tokenizer


@lru_cache(maxsize=256)
def _parse(text):
    offsets = [0]
    for char in text:
        offsets.append(offsets[-1] + (2 if ord(char) > 0xffff else 1))
    tokens = []
    for m in _tokenizer().tokenize(text):
        pos = m.part_of_speech()
        token = dict(surface=m.surface(), reading=m.reading_form() or m.surface(),
                     baseForm=m.dictionary_form(), pos=pos[0], posDetail=pos[1],
                     conjugationType=pos[4], conjugationForm=pos[5],
                     start=offsets[m.begin()], end=offsets[m.end()], oov=m.is_oov())
        previous = tokens[-1] if tokens else None
        # Keep inflected verbs/adjectives clickable as a unit while preserving
        # their lemma and original morphology. Never merge across whitespace.
        attached = previous and previous['end'] == token['start'] and previous['pos'] in ('動詞', '形容詞') and (
            token['pos'] == '助動詞' or
            (token['pos'] == '助詞' and token['posDetail'] == '接続助詞' and token['surface'] in ('て', 'で')) or
            (token['pos'] == '動詞' and token['posDetail'] == '非自立可能' and previous['surface'].endswith(('て', 'で')))
        )
        if attached:
            previous['surface'] += token['surface']
            previous['reading'] += token['reading']
            previous['end'] = token['end']
            previous['oov'] = previous['oov'] or token['oov']
            previous['morphemes'].append(token)
        else:
            tokens.append(dict(token, morphemes=[token]))
    # Store serialized results so callers cannot mutate the shared cache.
    import json
    return json.dumps(tokens, ensure_ascii=False)


def parse_japanese(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 4096:
        raise ValueError('Text must contain between 1 and 4096 characters')
    import json
    return json.loads(_parse(text))
