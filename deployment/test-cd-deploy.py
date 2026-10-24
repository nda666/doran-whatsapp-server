import hashlib
import importlib.util
import io
import shutil
from pathlib import Path
import tarfile
import tempfile
import unittest
import copy
from unittest import mock

spec = importlib.util.spec_from_file_location('cd_deploy', Path(__file__).with_name('cd-deploy.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentGuards(unittest.TestCase):
    def cache_fixture(self, root):
        app, stage = root / 'app', root / 'stage'
        app.mkdir()
        stage.mkdir()
        for name in ['package.json', 'package-lock.json', '.nvmrc', '.npmrc',
                     'next.config.js', 'next-i18next.config.js', 'tsconfig.json',
                     'tsconfig.server.json', '.env', '.env.production']:
            for folder in (app, stage):
                (folder / name).write_bytes(b'fixture-config')
        for name in ['webpack/server-production', 'swc', 'fetch-cache']:
            folder = app / '.next/cache' / name
            folder.mkdir(parents=True)
            (folder / 'fixture').write_bytes(b'cached-content')
        (app / '.next/BUILD_ID').write_bytes(b'old-runtime')
        return app, stage

    def test_compiler_cache_reuse_excludes_runtime_and_data(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            app, stage = self.cache_fixture(Path(temp))
            self.assertTrue(deploy.restore_compiler_cache(app, stage))
            for name in ['webpack/server-production', 'swc']:
                self.assertEqual((stage / '.next/cache' / name / 'fixture').read_bytes(), b'cached-content')
            self.assertFalse((stage / '.next/cache/fetch-cache').exists())
            self.assertFalse((stage / '.next/BUILD_ID').exists())
            # Staging and the running app must not share writable cache files.
            (stage / '.next/cache/swc/fixture').write_bytes(b'new-build')
            self.assertEqual((app / '.next/cache/swc/fixture').read_bytes(), b'cached-content')

    def test_compiler_cache_invalidates_for_dependencies_config_and_environment(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            app, stage = self.cache_fixture(Path(temp))
            for name in ['package.json', 'package-lock.json', '.nvmrc', '.npmrc',
                         'next.config.js', 'next-i18next.config.js', 'tsconfig.json',
                         'tsconfig.server.json', '.env', '.env.production']:
                path = stage / name
                original = path.read_bytes()
                path.write_bytes(b'changed-config')
                with self.subTest(name=name):
                    self.assertFalse(deploy.restore_compiler_cache(app, stage))
                    self.assertFalse((stage / '.next').exists())
                path.write_bytes(original)
            (stage / '.env.local').write_bytes(b'extra-config')
            self.assertFalse(deploy.restore_compiler_cache(app, stage))
            (stage / '.env.local').unlink()
            (stage / 'package-lock.json').unlink()
            self.assertFalse(deploy.restore_compiler_cache(app, stage))

    def test_failed_cache_copy_allows_cold_build_without_partial_files(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            app, stage = self.cache_fixture(Path(temp))
            def fail_copy(source, target):
                Path(target).mkdir()
                (Path(target) / 'partial').write_bytes(b'incomplete')
                raise OSError('fixture copy failure')
            with mock.patch.object(deploy.shutil, 'copytree', side_effect=fail_copy):
                self.assertFalse(deploy.restore_compiler_cache(app, stage))
            self.assertFalse((stage / '.next/cache/webpack').exists())
            self.assertFalse((stage / '.next/cache/swc').exists())
            self.assertEqual((app / '.next/cache/swc/fixture').read_bytes(), b'cached-content')

    def test_session_snapshot_detects_nested_changes_additions_and_deletions(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            app = Path(temp)
            auth = app / 'storage/whatsapp-auth/device/nested'
            auth.mkdir(parents=True)
            (app / '.env').write_bytes(b'fixture-env')
            key = auth / 'session.json'
            key.write_bytes(b'original')
            initial = deploy.private_hashes(app)
            self.assertEqual(initial, {'.env': hashlib.sha256(b'fixture-env').hexdigest(),
                str(key.relative_to(app)): hashlib.sha256(b'original').hexdigest()})
            key.write_bytes(b'changed!')  # Same size; compare contents, not metadata.
            self.assertNotEqual(deploy.private_hashes(app), initial)
            key.write_bytes(b'original')
            extra = auth / 'new-key.json'
            extra.write_bytes(b'new')
            self.assertNotEqual(deploy.private_hashes(app), initial)
            extra.unlink()
            self.assertEqual(deploy.private_hashes(app), initial)
            key.unlink()
            self.assertNotEqual(deploy.private_hashes(app), initial)

    def test_unrelated_process_guard_handles_only_recovered_sms_restart(self):
        def process(name, pid):
            return {'name': name, 'pid': pid, 'pm2_env': {
                'status': 'online', 'restart_time': 4, 'pm_id': pid,
                'created_at': 100, 'pm_exec_path': '/apps/' + name,
                'pm_cwd': '/apps', 'exec_interpreter': 'node',
                'exec_mode': 'fork_mode', 'args': [], 'node_args': []}}
        before = deploy.unrelated_processes([
            process('backendsms', 10), process('telegram-sender', 20),
            process('doran-whatsapp', 30)])
        self.assertNotIn('doran-whatsapp', before)
        self.assertEqual(deploy.check_unrelated_processes(before, before), [])
        after = copy.deepcopy(before)
        after['backendsms'].update(pid=11, restart_time=5)
        self.assertEqual(deploy.check_unrelated_processes(before, after), ['backendsms'])
        for key, value in [('status', 'errored'), ('pid', 0), ('restart_time', 4),
                           ('pm_exec_path', '/other'), ('pm_id', 99),
                           ('created_at', 101), ('node_args', ['--inspect'])]:
            changed = copy.deepcopy(after)
            changed['backendsms'][key] = value
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                deploy.check_unrelated_processes(before, changed)
        changed = copy.deepcopy(before)
        changed['telegram-sender'].update(pid=21, restart_time=5)
        with self.assertRaises(RuntimeError):
            deploy.check_unrelated_processes(before, changed)
        for changed in [{}, dict(after, unexpected=after['backendsms'])]:
            with self.assertRaises(RuntimeError):
                deploy.check_unrelated_processes(before, changed)

    @unittest.skipUnless(shutil.which('tar'), 'tar executable required')
    def test_private_backup_preserves_env_auth_and_public_uploads(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            root = Path(temp)
            app = root / 'app'
            (app / 'storage/whatsapp-auth/device').mkdir(parents=True)
            (app / 'public/uploads').mkdir(parents=True)
            (app / '.env').write_bytes(b'FIXTURE_SECRET=private-test\n')
            (app / 'storage/whatsapp-auth/device/creds.json').write_bytes(b'{"fixture":true}')
            (app / 'public/uploads/photo.txt').write_bytes(b'user-upload-fixture')
            snapshot = deploy.private_hashes(app)
            self.assertEqual(len(snapshot), 2)
            archive_path = root / 'private.tar'
            deploy.backup_private_files(app, archive_path)
            with tarfile.open(archive_path) as archive:
                self.assertEqual(archive.extractfile('.env').read(), b'FIXTURE_SECRET=private-test\n')
                self.assertEqual(archive.extractfile('storage/whatsapp-auth/device/creds.json').read(), b'{"fixture":true}')
                self.assertEqual(archive.extractfile('public/uploads/photo.txt').read(), b'user-upload-fixture')
            self.assertEqual(deploy.private_hashes(app), snapshot)

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

    def test_quota_initialization_preserves_existing_table_counts(self):
        before = {'counts': {'phones': '20', 'device_daily_usage': '50'}, 'migrations': []}
        after = {'counts': dict(before['counts'], device_quota_windows='12'), 'migrations': []}
        deploy.compare_counts(before, after, ['device_quota_windows'], {'device_quota_windows': '12'})
        with self.assertRaises(RuntimeError):
            deploy.compare_counts(before, after, ['device_quota_windows'])
        with self.assertRaises(RuntimeError):
            deploy.compare_counts(before, {'counts': dict(after['counts'], device_daily_usage='49'), 'migrations': []}, ['device_quota_windows'], {'device_quota_windows': '12'})

    def test_only_approved_new_empty_tables_can_be_added(self):
        before = {'counts': {'phones': '20', '_prisma_migrations': '5'}, 'migrations': [{'checksum': 'original'}]}
        after = {'counts': dict(before['counts'], sender_groups='0', wa_dispatch_attempts='0'), 'migrations': before['migrations']}
        deploy.compare_counts(before, after, ['sender_groups', 'wa_dispatch_attempts'])
        for table in ['users', 'unexpected']:
            with self.assertRaises(RuntimeError):
                deploy.compare_counts(before, after, [table])
        for changes in [{'phones': '19'}, {'sender_groups': '1'}, {'_prisma_migrations': '6'}]:
            with self.assertRaises(RuntimeError):
                deploy.compare_counts(before, {'counts': dict(after['counts'], **changes), 'migrations': before['migrations']}, ['sender_groups', 'wa_dispatch_attempts'])


if __name__ == '__main__':
    unittest.main()
