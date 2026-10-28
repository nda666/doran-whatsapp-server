import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

import private_snapshot as snapshots


class PrivateSnapshots(unittest.TestCase):
    def fixture(self, root):
        app = root / 'app'
        auth = app / 'storage/whatsapp-auth/device'
        auth.mkdir(parents=True)
        (app / '.env').write_bytes(b'fixture-env')
        (auth / 'creds.json').write_bytes(b'fixture-creds')
        (auth / 'session.json').write_bytes(b'old-key')
        (auth / 'deleted.json').write_bytes(b'removed-later')
        (app / 'public/uploads').mkdir(parents=True)
        (app / 'public/uploads/photo').write_bytes(b'fixture-upload')
        (app / 'public/downloads').mkdir()
        (app / 'public/downloads/export').write_bytes(b'fixture-download')
        return app, auth, root / 'backups'

    @unittest.skipUnless(shutil.which('rsync'), 'Linux rsync integration required')
    def test_independent_restore_reuse_change_delete_and_live_isolation(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            app, auth, root = self.fixture(Path(temp))
            first = snapshots.create_snapshot(app, root, 'first')
            # Same size + same whole-second timestamp, different nanoseconds.
            key = auth / 'session.json'
            previous_ns = key.stat().st_mtime_ns
            key.write_bytes(b'new-key')
            next_ns = previous_ns + (1 if previous_ns % 1000000000 < 999999999 else -1)
            os.utime(str(key), ns=(next_ns, next_ns))
            (auth / 'deleted.json').unlink()
            (auth / 'added.json').write_bytes(b'new-file')
            (app / 'public/downloads/export').unlink()
            second = snapshots.create_snapshot(app, root, 'second')
            relative = 'storage/whatsapp-auth/device/'
            self.assertEqual((first / 'files' / relative / 'session.json').read_bytes(), b'old-key')
            self.assertEqual((second / 'files' / relative / 'session.json').read_bytes(), b'new-key')
            self.assertTrue((first / 'files' / relative / 'deleted.json').exists())
            self.assertFalse((second / 'files' / relative / 'deleted.json').exists())
            self.assertFalse((second / 'files/public/downloads/export').exists())
            self.assertEqual((first / 'files/.env').stat().st_ino, (second / 'files/.env').stat().st_ino)
            self.assertNotEqual((app / '.env').stat().st_ino, (second / 'files/.env').stat().st_ino)
            # Restore the latest snapshot after deleting its predecessor entirely.
            shutil.rmtree(str(first))
            restored = Path(temp) / 'restore'
            shutil.copytree(str(second / 'files'), str(restored))
            self.assertEqual((restored / relative / 'session.json').read_bytes(), b'new-key')
            self.assertEqual((restored / relative / 'added.json').read_bytes(), b'new-file')
            self.assertEqual((restored / 'public/uploads/photo').read_bytes(), b'fixture-upload')
            self.assertEqual((restored / relative / 'creds.json').read_bytes(), b'fixture-creds')
            self.assertEqual(snapshots.previous_snapshot(root), second)

    def test_failed_copy_does_not_publish_incomplete_snapshot(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            app, auth, root = self.fixture(Path(temp))
            with mock.patch.object(snapshots.subprocess, 'run', return_value=mock.Mock(returncode=23, stderr=b'fixture failure')):
                with self.assertRaises(RuntimeError):
                    snapshots.create_snapshot(app, root, 'failed')
            self.assertFalse((root / 'latest.json').exists())
            self.assertFalse(any(root.glob('*/COMPLETE.json')))

    def test_rejects_pointer_escape_and_incomplete_previous(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            root = Path(temp)
            for name in ['../outside', 'snapshot-missing']:
                (root / 'latest.json').write_text(json.dumps({'snapshot': name}))
                with self.assertRaises(ValueError):
                    snapshots.previous_snapshot(root)

    def test_retention_preserves_latest_two_newest_and_incomplete(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            root = Path(temp)
            for number in range(4):
                folder = root / ('snapshot-' + str(number))
                folder.mkdir()
                marker = folder / 'COMPLETE.json'
                marker.write_text('{}')
                os.utime(str(marker), (100 + number, 100 + number))
            (root / 'snapshot-999').mkdir()
            (root / 'latest.json').write_text(json.dumps({'snapshot': 'snapshot-0'}))
            (root / 'snapshot-0/files').mkdir()
            self.assertEqual(snapshots.prune_snapshots(root), ['snapshot-1'])
            for number in [0, 2, 3, 999]:
                self.assertTrue((root / ('snapshot-' + str(number))).is_dir())


if __name__ == '__main__':
    unittest.main()
