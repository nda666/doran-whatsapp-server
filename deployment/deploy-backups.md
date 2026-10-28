# Incremental deploy backups

Code deploys leave `storage` and `.env*` in place. User uploads/downloads are
moved aside on the same filesystem and reattached when `public` is swapped.
The bounded integrity guard hashes environment and per-device `creds.json`
and checks persistent directory identities. It does not hash every Signal key.
Source archives reject private runtime data and user uploads.

Before promotion, while the application is stopped, `private_snapshot.py`
creates a complete snapshot under `/home/jeblast/backups/private-snapshots`.
`rsync --link-dest` reuses unchanged files from the preceding **backup**;
live files are never hardlinked. Every destination starts empty. Nanosecond
mtime comparisons detect same-size writes within the same second. Files removed
from live storage are absent from the new snapshot, but remain in old snapshots.
Any rsync error aborts promotion and keeps the previous completed snapshot pointer.
Incomplete directories are retained for inspection, never published as complete.

Each deploy backup contains `private-snapshot.json` pointing to its snapshot,
alongside its own database dump, schema audit and previous runtime. Snapshots
remain individually restorable even after older snapshots are removed.

The user approved retention on 2026-10-28: keep seven days and at least the two
newest completed snapshots. Daily maintenance applies this policy only inside
the dedicated snapshot root and shares the CI/CD lock. The latest pointer and
incomplete snapshots are preserved. Existing historical tar/SQL backups are
outside this policy and are not deleted by it.

## Recovery

For a failed code promotion, the deployer automatically restores the previous
runtime and restarts it; persistent storage is not replaced.

For intentional private-data recovery, stop `doran-whatsapp`, acquire the CD lock,
and preserve the current private state in a separate recovery location first.
Read the selected snapshot's `COMPLETE.json` and the deploy's database manifest.
Restore only the `.env*`, `storage`, `public/uploads`, and `public/downloads`
entries from `snapshot/files/` to their matching application locations with rsync.
To reproduce deleted files correctly, reconcile deletions only within those
explicit private subdirectories; never use `--delete` on the entire app root.
Restore the matching database dump only if recovery requires a database rollback.
Restart and check application, database and dispatch health before resuming use.

## Initial baseline

An existing stopped-app `storage-and-env.tar` can be imported once with
`python3 deployment/private_snapshot.py --seed-archive /absolute/path/to/archive`.
This reads the old backup, not active WhatsApp keys. The first current snapshot
may copy files whose nanosecond timestamps were lost in the historical tar;
following snapshots retain that precision and reuse unchanged backup files.
Linux integration tests in `test-private-snapshot.py` exercise independent
restoration, deletion, same-second changes, hardlink isolation and failure handling.
