import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('artifacts', Path(__file__).with_name('artifact-maintenance.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        (self.home / 'repos').mkdir()
        (self.home / 'backups').mkdir()
        self.saved_paths = mod.process_paths
        self.saved_refs = mod.references
        mod.process_paths = lambda: set()
        mod.references = lambda home, names: set()

    def tearDown(self):
        mod.process_paths = self.saved_paths
        mod.references = self.saved_refs
        self.temp.cleanup()

    def incoming(self, success=True, top=False):
        sha = 'a' * 40
        folder = (self.home if top else self.home / 'repos') / ('.doran-incoming-' + sha)
        folder.mkdir()
        archive = folder / 'source.tar.gz'
        archive.write_bytes(b'source archive fixture')
        checksum = mod.digest(archive)
        (folder / 'source.tar.gz.sha256').write_text(checksum + '  source.tar.gz\n')
        for p in folder.iterdir():
            os.utime(str(p), (1, 1))
        os.utime(str(folder), (1, 1))
        if success:
            backup = self.home / 'backups/doran-cd-123'
            backup.mkdir()
            (backup / 'runtime').mkdir()
            (backup / 'database.sql').write_text('preserve database')
            (backup / 'SUCCESS.json').write_text(json.dumps({'commit': sha, 'archive_sha256': checksum}))
        return folder

    def work(self):
        folder = self.home / 'repos/.doran-work-test'
        folder.mkdir()
        p = folder / 'temporary.py'
        p.write_text('# completed one-off fixture\n')
        (folder / 'artifact-manifest.json').write_text(json.dumps({
            'version': 1, 'state': 'completed',
            'files': [{'name': p.name, 'sha256': mod.digest(p)}]}))
        return folder, p

    def test_successful_upload_removed_backups_preserved(self):
        folder = self.incoming()
        report = mod.maintain(self.home)
        self.assertFalse(folder.exists())
        self.assertEqual(report['actions'][0]['action'], 'remove_completed_incoming')
        self.assertTrue((self.home / 'backups/doran-cd-123/database.sql').is_file())

    def test_dry_run_never_removes(self):
        folder = self.incoming()
        mod.maintain(self.home, True)
        self.assertTrue(folder.exists())

    def test_targeted_cleanup_uses_repos_backup_and_preserves_other_jobs(self):
        folder = self.incoming()
        new_backups = self.home / 'repos/doran-backups'
        new_backups.mkdir()
        (self.home / 'backups/doran-cd-123').rename(new_backups / 'doran-cd-123')
        other = self.home / 'repos' / ('.doran-incoming-' + 'b' * 40)
        other.mkdir()
        (other / 'diagnosis.log').write_text('preserve other deployment')
        _, temporary = self.work()
        report = mod.maintain(self.home, incoming_commit='a' * 40)
        self.assertFalse(folder.exists())
        self.assertTrue(other.exists())
        self.assertTrue(temporary.exists())
        self.assertTrue((new_backups / 'doran-cd-123/database.sql').exists())
        self.assertEqual(len(report['actions']), 1)
        with self.assertRaises(ValueError):
            mod.maintain(self.home, incoming_commit='../unsafe')

    def test_failed_upload_relocated_but_not_deleted(self):
        folder = self.incoming(False, True)
        mod.maintain(self.home)
        self.assertFalse(folder.exists())
        self.assertTrue((self.home / 'repos' / folder.name / 'source.tar.gz').is_file())

    def test_active_upload_preserved(self):
        folder = self.incoming()
        mod.process_paths = lambda: {folder / 'deployment/cd-deploy.py'}
        mod.maintain(self.home)
        self.assertTrue(folder.exists())

    def test_new_failed_retry_not_matched_to_old_success(self):
        folder = self.incoming()
        os.utime(str(self.home / 'backups/doran-cd-123/SUCCESS.json'), (0, 0))
        self.assertFalse(mod.completed_upload(folder, self.home / 'backups'))
        mod.maintain(self.home)
        self.assertTrue(folder.exists())

    def test_unknown_content_and_symlink_preserved(self):
        folder = self.incoming()
        (folder / 'user-data').symlink_to(self.home / 'backups', target_is_directory=True)
        self.assertIsNone(mod.upload_inventory(folder))
        mod.maintain(self.home)
        self.assertTrue(folder.exists())

    def test_checksum_mismatch_preserved(self):
        folder = self.incoming()
        (folder / 'source.tar.gz.sha256').write_text('b' * 64 + '  source.tar.gz\n')
        self.assertFalse(mod.completed_upload(folder, self.home / 'backups'))

    def test_manifest_only_cleanup_preserves_unlisted_files(self):
        folder, p = self.work()
        keep = folder / 'keep.zip'
        keep.write_bytes(b'unknown archive')
        mod.maintain(self.home)
        self.assertFalse(p.exists())
        self.assertTrue(keep.exists())

    def test_changed_or_referenced_file_preserved(self):
        folder, p = self.work()
        mod.references = lambda home, names: {p.name}
        mod.maintain(self.home)
        self.assertTrue(p.exists())
        mod.references = lambda home, names: set()
        p.write_text('changed since completion')
        mod.maintain(self.home)
        self.assertTrue(p.exists())

    def test_legacy_without_manifest_never_deleted(self):
        folder = self.home / 'repos/.doran-work-legacy-20261111'
        folder.mkdir()
        (folder / 'recovery.zip').write_bytes(b'preserve')
        mod.maintain(self.home)
        self.assertTrue((folder / 'recovery.zip').exists())

    def test_manifest_traversal_rejected(self):
        folder, p = self.work()
        outside = self.home / 'repos/outside.py'
        outside.write_text('preserve')
        (folder / 'artifact-manifest.json').write_text(json.dumps({
            'version': 1, 'state': 'completed',
            'files': [{'name': '../outside.py', 'sha256': mod.digest(outside)}]}))
        mod.maintain(self.home)
        self.assertTrue(outside.exists())
        self.assertTrue(p.exists())


if __name__ == '__main__':
    unittest.main()
