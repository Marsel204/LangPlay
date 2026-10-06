"""Keep local model generation and the extension's waiting budget compatible."""
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('linguaplay_server', Path(__file__).resolve().parents[1] / 'Server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class AnalysisTimeoutTests(unittest.TestCase):
    def test_model_response_after_thirty_seconds_can_finish(self):
        def delayed_model(command, **kwargs):
            if kwargs['timeout'] <= 35:
                raise subprocess.TimeoutExpired(command, kwargs['timeout'])
            return subprocess.CompletedProcess(command, 0, stdout='{"contextual_meaning":"cat"}', stderr='')

        with patch.object(server, 'find_agy_binary', return_value='/test/agy'), patch.object(server.subprocess, 'run', side_effect=delayed_model):
            result = server.run_antigravity_analysis('猫', '猫がいる', 'neko')
        self.assertEqual(result['contextual_meaning'], 'cat')

    def test_model_timeout_is_still_bounded(self):
        with patch.object(server, 'find_agy_binary', return_value='/test/agy'), patch.object(server.subprocess, 'run', side_effect=subprocess.TimeoutExpired('agy', 90)) as run:
            with self.assertRaises(subprocess.TimeoutExpired):
                server.run_antigravity_analysis('猫', '猫がいる')
        self.assertEqual(run.call_args.kwargs['timeout'], 90)


if __name__ == '__main__':
    unittest.main()
