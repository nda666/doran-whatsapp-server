"""Isolated code-only deployment; backup runs while the live service stays online."""
from pathlib import Path
from stage_cleanup import StageCleanup
source=Path(__file__).with_name('deploy-send-guard-20261105.py').read_text()
source=source.replace('deployment/verify-send-guard-build.cjs','deployment/verify-auth-maintenance.cjs')
source=source.replace("['node', 'deployment/ci-tests.cjs']", "['node', 'deployment/verify-phone-cleanup-jobs.cjs'], ['node', 'deployment/verify-auth-maintenance-mysql.cjs'], ['node', 'deployment/ci-tests.cjs']")
source=source.replace('send-guard','auth-lifecycle').replace('SEND_GUARD_DEPLOYED','AUTH_LIFECYCLE_DEPLOYED')
source=source.replace('    stage.mkdir(mode=0o700)','    stage.mkdir(mode=0o700)\n    cleanup = StageCleanup(APP.parent, stage)')
source=source.replace("DISPATCH_QUEUE_ENABLED='false', NODE_OPTIONS=", "DISPATCH_QUEUE_ENABLED='false', ALLOW_AUTH_MAINTENANCE_DB_TEST='1', AUTH_MAINTENANCE_TEST_BACKUP=str(backup), NODE_OPTIONS=")
source=source.replace("    (backup / 'READY').write_text", "    print('LIVE_BACKUP_STARTED', flush=True)\n    run(['node', 'deployment/cd-database.cjs', 'dump', str(backup / 'database.sql')], APP, backup / 'checks.log')\n    print('LIVE_BACKUP_COMPLETED', flush=True)\n    (backup / 'READY').write_text")
source=source.replace("    print('PATCH_READY', backup, flush=True)","    cleanup.preserve = True\n    print('PATCH_READY', backup, flush=True)")
source=source.replace("    assert (backup / 'READY').read_text()","    cleanup = StageCleanup(APP.parent, stage)\n    assert (backup / 'READY').read_text()")
source=source.replace("    try:\n        pm2('stop'","    cleanup.preserve = True\n    try:\n        pm2('stop'")
source=source.replace("        run(['node', 'deployment/cd-database.cjs', 'dump', str(backup / 'database.sql')], APP, backup / 'promotion.log')","        assert (backup / 'database.sql').stat().st_size > 0")
source=source.replace("        print('PATCH_ROLLED_BACK'","        cleanup.preserve = False\n        print('PATCH_ROLLED_BACK'")
source=source.replace('    shutil.rmtree(str(stage))','    cleanup.preserve = False\n    cleanup.cleanup()')
exec(compile(source,str(Path(__file__)),'exec'))
