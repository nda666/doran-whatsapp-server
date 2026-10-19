from pathlib import Path
import shutil
for family, stamp in [('webhook-log-table', '1791741465'), ('webhook-log-width', '1791741596')]:
    stage = Path('/home/jeblast/repos') / ('.doran-' + family + '-' + stamp)
    assert stage.parent == Path('/home/jeblast/repos') and stage.resolve() == stage and not stage.is_symlink()
    assert (Path('/home/jeblast/backups') / ('doran-' + family + '-' + stamp) / 'runtime').is_dir()
    if stage.exists(): shutil.rmtree(stage)
print('STAGING_REMOVED_BACKUPS_RETAINED')
