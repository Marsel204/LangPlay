"""Collect the approved HTTP snapshot unchanged with a portable source root."""
import importlib.util
import os
from pathlib import Path
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('local_meaning_proposal', root / 'tests/proposals/local_meaning_proposal.py')
proposal = importlib.util.module_from_spec(spec)
with patch.dict(os.environ, {'LANGPLAY_SOURCE_ROOT': str(root)}):
    spec.loader.exec_module(proposal)
LocalMeaningRequirements = proposal.LocalMeaningRequirements
