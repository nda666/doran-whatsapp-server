"""Cleanup only an owned staging directory; preserve it while rollback is unsafe."""
import atexit
import shutil
from pathlib import Path


class StageCleanup:
    def __init__(self, root, stage):
        self.root = Path(root).resolve()
        self.stage = Path(stage)
        self.preserve = False
        self.validate()
        atexit.register(self.cleanup)

    def validate(self):
        if self.stage.is_symlink() or self.stage.parent.resolve() != self.root:
            raise ValueError('Unsafe staging path')
        if not self.stage.name.startswith('.doran-') or self.stage.resolve().parent != self.root:
            raise ValueError('Not a deployment staging directory')

    def cleanup(self):
        if self.preserve:
            print('STAGE_PRESERVED_FOR_RECOVERY', self.stage, flush=True)
            return
        self.validate()
        if self.stage.exists():
            shutil.rmtree(str(self.stage))  # Nested symlinks are removed, never followed.
            print('STAGE_REMOVED', self.stage.name, flush=True)
