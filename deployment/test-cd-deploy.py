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
    def test_streamed_digest_matches_full_content(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            path = Path(temp) / 'large-auth-fixture'
            data = b'fixture-auth-state\x00' * 150000
            path.write_bytes(data)
            self.assertEqual(deploy.file_digest(path), hashlib.sha256(data).hexdigest())
            path.write_bytes(b'')
            self.assertEqual(deploy.file_digest(path), hashlib.sha256(b'').hexdigest())

    def test_production_prisma_write_commands_are_blocked(self):
        for operation in [['migrate', 'deploy'], ['migrate', 'resolve', '--applied', '001'],
                          ['migrate', 'reset'], ['migrate', 'dev'], ['db', 'push'], ['db', 'execute'], ['db', 'seed']]:
            with self.subTest(operation=operation), self.assertRaises(RuntimeError):
                deploy.enforce_read_only_prisma(['npx', '--no-install', 'prisma'] + operation)
        for operation in [['generate'], ['validate'], ['migrate', 'diff', '--exit-code']]:
            deploy.enforce_read_only_prisma(['npx', '--no-install', 'prisma'] + operation)

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

    def test_history_differences_are_recorded_without_applying_sql(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as root:
            stage = Path(root)
            migration = stage / 'prisma/migrations/001/migration.sql'
            migration.parent.mkdir(parents=True)
            migration.write_text('DROP TABLE phones;')
            before = {'migrations': []}
            report = deploy.migration_inventory(before, stage)
            self.assertEqual(report['not_recorded_as_applied'], ['001'])
            self.assertFalse(report['migrations_executed'])
            self.assertFalse(report['history_updated'])
            before['migrations'] = [{'migration_name': '001', 'finished_at': 'ok', 'rolled_back_at': None, 'checksum': hashlib.sha256(migration.read_bytes()).hexdigest()}]
            self.assertEqual(deploy.migration_inventory(before, stage)['not_recorded_as_applied'], [])
            migration.write_text('ALTER TABLE phones ADD label TEXT;')
            report = deploy.migration_inventory(before, stage)
            self.assertEqual(report['checksum_differences'][0]['migration'], '001')
            self.assertEqual(before['migrations'][0]['checksum'], report['checksum_differences'][0]['database_checksum'])
            before['migrations'].append({'migration_name': '002', 'finished_at': None, 'rolled_back_at': None, 'checksum': 'old'})
            self.assertEqual(deploy.migration_inventory(before, stage)['unfinished_migrations'], ['002'])

    def test_no_record_loss_or_table_disappearance(self):
        before = {'counts': {'users': '5', 'phones': '20', '_prisma_migrations': '1'}, 'migrations': [{'checksum': 'original'}]}
        deploy.compare_counts(before, before)
        for counts in [{'users': '5', 'phones': '19'}, {'users': '5'}]:
            with self.assertRaises(RuntimeError):
                deploy.compare_counts(before, {'counts': counts, 'migrations': before['migrations']})
        with self.assertRaises(RuntimeError):
            deploy.compare_counts(before, {'counts': before['counts'], 'migrations': [{'checksum': 'changed'}]})


if __name__ == '__main__':
    unittest.main()
