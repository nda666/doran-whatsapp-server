"""Isolated follow-up; reuse the completed private DB snapshot via a hardlink."""
from pathlib import Path
from stage_cleanup import StageCleanup
source=Path(__file__).with_name('deploy-send-guard-20261105.py').read_text()
source=source.replace('deployment/verify-send-guard-build.cjs','deployment/verify-phone-cleanup.cjs')
source=source.replace("['node', 'deployment/ci-tests.cjs']", "['node', 'deployment/verify-phone-cleanup-jobs.cjs'], ['node', 'deployment/verify-phone-cleanup-background.cjs'], ['node', 'deployment/verify-whatsapp-hardening.cjs'], ['node', 'deployment/ci-tests.cjs']")
source=source.replace('send-guard','cleanup-followup').replace('SEND_GUARD_DEPLOYED','CLEANUP_FOLLOWUP_DEPLOYED')
source=source.replace('    stage.mkdir(mode=0o700)','    stage.mkdir(mode=0o700)\n    cleanup = StageCleanup(APP.parent, stage)')
source=source.replace("    print('PATCH_READY', backup, flush=True)","    cleanup.preserve = True\n    print('PATCH_READY', backup, flush=True)")
source=source.replace("    assert (backup / 'READY').read_text()","    cleanup = StageCleanup(APP.parent, stage)\n    assert (backup / 'READY').read_text()")
source=source.replace("    try:\n        pm2('stop'","    cleanup.preserve = True\n    try:\n        pm2('stop'")
source=source.replace("        run(['node', 'deployment/cd-database.cjs', 'dump', str(backup / 'database.sql')], APP, backup / 'promotion.log')", "        snapshot = Path('/home/jeblast/backups/doran-cleanup-batches-1794300699')\n        assert (snapshot / 'SUCCESS.json').exists()\n        os.link(str(snapshot / 'database.sql'), str(backup / 'database.sql'))")
source=source.replace("        print('PATCH_ROLLED_BACK'","        cleanup.preserve = False\n        print('PATCH_ROLLED_BACK'")
source=source.replace('    shutil.rmtree(str(stage))','    cleanup.preserve = False\n    cleanup.cleanup()')
exec(compile(source,str(Path(__file__)),'exec'))
