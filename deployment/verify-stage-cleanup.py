import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('stage_cleanup', Path(__file__).with_name('stage_cleanup.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CleanupTests(unittest.TestCase):
    def test_owned_stage_removed_runtime_preserved(self):
        with tempfile.TemporaryDirectory(dir=str(Path(__file__).resolve().parent)) as temp:
            root = Path(temp)
            app = root / 'doran-whatsapp-server'
            app.mkdir()
            (app / 'keep').write_text('production')
            stage = root / '.doran-test'
            stage.mkdir()
            (stage / 'build').write_text('temporary')
            guard = module.StageCleanup(root, stage)
            guard.preserve = True
            guard.cleanup()
            self.assertTrue(stage.exists(), 'rollback failure keeps recovery files')
            guard.preserve = False
            guard.cleanup()
            self.assertFalse(stage.exists())
            self.assertEqual((app / 'keep').read_text(), 'production')

    def test_root_production_and_outside_paths_rejected(self):
        with tempfile.TemporaryDirectory(dir=str(Path(__file__).resolve().parent)) as temp:
            root = Path(temp)
            for target in [root, root / 'doran-whatsapp-server', root.parent / '.doran-outside']:
                with self.assertRaises(ValueError): module.StageCleanup(root, target)


if __name__ == '__main__': unittest.main()
