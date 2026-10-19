from pathlib import Path
import base64, hashlib, json, subprocess, zipfile

root = Path(__file__).resolve().parent.parent
name = 'dispatch-store-filter'
live_test = (root/'deployment/verify-dispatch-dates-live.cjs').read_text()
live_test = live_test.replace("  const { encode }", """  const headers = { Authorization: 'Bearer ' + admin.token };
  const params = new URLSearchParams({ ...dates, limit: '100', status: '' });
  const unfiltered = await (await fetch(base + '/api/dispatch?' + params, { headers })).json();
  for (const [filter, storeId] of [['non_default', { not: 'default' }], ['default', 'default']]) {
    const response = await fetch(base + '/api/dispatch?' + params + '&store_filter=' + filter, { headers });
    assert.equal(response.status, 200);
    const body = await response.json();
    const where = { createdAt: { gt: new Date(body.display_cutoff), ...range }, storeId };
    assert.equal(body.total, await db.waDispatch.count({ where }));
    assert(body.data.every(job => filter === 'non_default' ? job.store_id !== 'default' : job.store_id === 'default'));
    assert.deepEqual(body.counts, unfiltered.counts);
  }
  const conflict = await (await fetch(base + '/api/dispatch?' + params + '&store_filter=non_default&store_id=default', { headers })).json();
  assert.equal(conflict.total, 0);
  const { encode }""")
live_test = live_test.replace("assert(html.includes('Tanggal mulai')", "assert(html.includes('Filter store'));\n  assert(html.includes('Tanggal mulai')")
live_test = live_test.replace('DISPATCH_DATES_LIVE_OK:', 'DISPATCH_STORE_FILTER_LIVE_OK: store exclusions, defaults, database totals, search composition,')
(root/'deployment/verify-dispatch-store-filter-live.cjs').write_text(live_test)
names = ['src/pages/dashboard/dispatch.tsx', 'src/pages/api/dispatch.ts', 'deployment/verify-dispatch-display-age.cjs', 'deployment/verify-dispatch-store-filter-live.cjs']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).exists() else None for n in names}))"
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', 'python3', '-'], input=remote.encode(), capture_output=True, check=True)
snapshot = json.loads(result.stdout)
baseline, manifest = {}, {}
before = root/'tmp/dispatch-store-filter-live-before'
with zipfile.ZipFile(root/'deployment/dispatch-store-filter-20261014.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file, encoded in snapshot.items():
        previous = base64.b64decode(encoded) if encoded else None
        baseline[file] = hashlib.sha256(previous).hexdigest() if previous is not None else None
        if previous is not None:
            target = before/file
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(previous)
        data = (root/file).read_bytes()
        manifest[file] = hashlib.sha256(data).hexdigest()
        archive.writestr(file,data)
    archive.writestr('baseline.json',json.dumps(baseline))
    archive.writestr('manifest.json',json.dumps(manifest))
deploy = (root/'deployment/deploy-dispatch-dates-20261014.py').read_text().replace('dispatch-dates', name).replace('DEPLOYED_DISPATCH_DATES', 'DEPLOYED_DISPATCH_STORE_FILTER')
(root/'deployment/deploy-dispatch-store-filter-20261014.py').write_text(deploy)
print('DISPATCH_STORE_FILTER_PACKAGE_READY')
