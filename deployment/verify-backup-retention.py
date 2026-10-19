from pathlib import Path
import tempfile
import unittest
from backup_retention import prune_deploy_backups, retention_plan


class RetentionTests(unittest.TestCase):
    def test_only_previous_deploy_kept_data_untouched(self):
        with tempfile.TemporaryDirectory(dir=str(Path(__file__).resolve().parent)) as temp:
            root = Path(temp) / 'backups'
            root.mkdir()
            keep = root / 'doran-latest'
            (keep / 'runtime/.next').mkdir(parents=True)
            (keep / 'runtime/dist').mkdir()
            (keep / 'runtime/.next/BUILD_ID').write_text('previous-version')
            old = root / 'doran-old'
            old.mkdir()
            (old / 'source').mkdir()
            sessions = root / 'doran-sessions'
            sessions.mkdir()
            (sessions / 'sessions-before.tar.gz').write_text('data-backup')
            other = root / 'pm2-settings'
            other.mkdir()
            self.assertEqual(set(retention_plan(root, keep)), {old, sessions})
            prune_deploy_backups(root, keep)
            self.assertFalse(old.exists())
            self.assertTrue(keep.exists())
            self.assertFalse(sessions.exists())
            self.assertEqual((root / 'data-backups' / sessions.name / 'sessions-before.tar.gz').read_text(), 'data-backup')
            self.assertTrue(other.exists())
            with self.assertRaises(ValueError): retention_plan(root, other)


if __name__ == '__main__': unittest.main()
