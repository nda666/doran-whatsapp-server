import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('cd_deploy', Path(__file__).with_name('cd-deploy.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentGuards(unittest.TestCase):
    def test_reviewed_migration_is_pinned_to_exact_sql(self):
        root = Path(__file__).resolve().parent.parent
        for name, digest in deploy.REVIEWED_MIGRATIONS.items():
            sql = (root / 'prisma/migrations' / name / 'migration.sql').read_bytes().replace(b'\r\n', b'\n')
            self.assertEqual(hashlib.sha256(sql).hexdigest(), digest)

    def archive(self, name, kind=tarfile.REGTYPE):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w') as archive:
            info = tarfile.TarInfo(name)
            info.type = kind
            if kind == tarfile.SYMTYPE:
                info.linkname = '/etc/passwd'
            archive.addfile(info)
        buffer.seek(0)
        return tarfile.open(fileobj=buffer)

    def test_rejects_traversal_links_and_private_files(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as root:
            for name in ['../outside', '/etc/passwd', '.env', 'nested/.env.production', 'storage/whatsapp-auth/creds.json', '.git/config', 'public/uploads/private.jpg', 'public/downloads/customer.csv']:
                with self.subTest(name=name), self.archive(name) as archive:
                    with self.assertRaises(ValueError):
                        deploy.validate_archive(archive, Path(root))
            with self.archive('public/link', tarfile.SYMTYPE) as archive:
                with self.assertRaises(ValueError):
                    deploy.validate_archive(archive, Path(root))
            with self.archive('.env.example') as archive:
                deploy.validate_archive(archive, Path(root))

    def test_additive_only_and_applied_checksums(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as root:
            stage = Path(root)
            migration = stage / 'prisma/migrations/001/migration.sql'
            migration.parent.mkdir(parents=True)
            migration.write_text('ALTER TABLE `phones` ADD COLUMN `label` VARCHAR(20) NULL;')
            before = {'migrations': []}
            self.assertEqual(deploy.check_migrations(before, stage), ['001'])
            before['migrations'] = [{'migration_name': '001', 'finished_at': 'ok', 'rolled_back_at': None, 'checksum': hashlib.sha256(migration.read_bytes()).hexdigest()}]
            self.assertEqual(deploy.check_migrations(before, stage), [])
            migration.write_text('DROP TABLE phones;')
            with self.assertRaises(RuntimeError):
                deploy.check_migrations(before, stage)
            for sql in ['DROP TABLE phones;', 'DELETE FROM phones;', 'ALTER TABLE phones MODIFY label TEXT;', 'ALTER TABLE phones ADD test INT, DROP COLUMN label;']:
                migration.write_text(sql)
                with self.assertRaises(RuntimeError):
                    deploy.check_migrations({'migrations': []}, stage)

    def test_legacy_exception_requires_exact_versions_and_existing_schema(self):
        root = Path(__file__).resolve().parent.parent
        for name, (old_checksum, source_checksum) in deploy.LEGACY_MIGRATION_VERSIONS.items():
            data = (root / 'prisma/migrations' / name / 'migration.sql').read_bytes().replace(b'\r\n', b'\n')
            self.assertEqual(hashlib.sha256(data).hexdigest(), source_checksum)
            with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
                stage = Path(temp)
                sql = stage / 'prisma/migrations' / name / 'migration.sql'
                sql.parent.mkdir(parents=True)
                sql.write_bytes(data)
                before = {'migrations': [{'migration_name': name, 'checksum': old_checksum, 'finished_at': 'ok', 'rolled_back_at': None}]}
                with self.assertRaises(RuntimeError):
                    deploy.check_migrations(before, stage)
                before['legacyInboxKeterangan'] = True
                self.assertEqual(deploy.check_migrations(before, stage), [])
                sql.write_bytes(data + b'\n-- changed\n')
                with self.assertRaises(RuntimeError):
                    deploy.check_migrations(before, stage)

    def test_no_record_loss_or_table_disappearance(self):
        before = {'counts': {'users': '5', 'phones': '20', '_prisma_migrations': '1'}}
        deploy.compare_counts(before, {'counts': {'users': '5', 'phones': '20', '_prisma_migrations': '2', 'new_table': '0'}})
        for counts in [{'users': '5', 'phones': '19'}, {'users': '5'}]:
            with self.assertRaises(RuntimeError):
                deploy.compare_counts(before, {'counts': counts})


if __name__ == '__main__':
    unittest.main()
