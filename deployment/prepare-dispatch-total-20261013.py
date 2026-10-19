from pathlib import Path
import base64, hashlib, json, subprocess, zipfile

root = Path(__file__).resolve().parent.parent
names = ['src/pages/dashboard/dispatch.tsx', 'src/pages/dashboard/index.tsx', 'deployment/verify-summary-cards-live.cjs']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() for n in names}))"
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186', 'python3', '-'], input=remote.encode(), capture_output=True, check=True)
snapshot = json.loads(result.stdout)
baseline, manifest = {}, {}
with zipfile.ZipFile(root/'deployment/dispatch-total-20261013.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, encoded in snapshot.items():
        previous = base64.b64decode(encoded)
        baseline[name] = hashlib.sha256(previous).hexdigest()
        source = previous.decode().replace('\r\n', '\n')
        if name == 'src/pages/dashboard/index.tsx':
            marker = '    <Row gutter={[16, 16]}>'
            start = source.index(marker)
            end = source.index('    </Row>', start)
            cards = source[start:end]
            assert cards.count('<Card loading={loading}>') == 3
            cards = cards.replace('<Card loading={loading}>', '<Card loading={loading} style={{ height: "100%" }}>')
            cards = cards.replace('<Card><Statistic title="Subscription"', '<Card style={{ height: "100%" }}><Statistic title="Subscription"')
            marker = '<span>Online: {d?.online || 0}</span>'
            assert cards.count(marker) == 1
            cards = cards.replace(marker, '<div>Online: {d?.online || 0}</div><div>Offline: {d ? d.devices - d.online : 0}</div>')
            source = source[:start] + cards + source[end:]
        elif name.endswith('.tsx'):
            source = source.replace('ClockCircleOutlined, ExportOutlined', 'DatabaseOutlined, ClockCircleOutlined, ExportOutlined')
            marker = 'items={Object.entries(statusInfo).map'
            assert source.count(marker) == 1
            source = source.replace(marker, '''items={[{
      key: "TOTAL", label: "Total Data Antrean Pengiriman",
      value: api.data ? Object.values(result.counts as Record<string, number>).reduce((sum, count) => sum + count, 0) : undefined,
      color: "#4274d7", icon: <DatabaseOutlined />,
      description: "Total data seluruh status pengiriman dalam rentang hari yang berlaku, tanpa mengikuti filter pencarian.", unit: "pesan",
    }, ...Object.entries(statusInfo).map''')
            marker = 'description: value.description, unit: "pesan",\n    }))} />'
            assert source.count(marker) == 1
            source = source.replace(marker, 'description: value.description, unit: "pesan",\n    }))]} />')
        else:
            source = source.replace("['dispatch', 'Ringkasan pengiriman', 7]", "['dispatch', 'Ringkasan pengiriman', 8]")
            source = source.replace('cards[4]', 'cards[5]').replace('cards[1]', 'cards[2]')
            marker = '    assert(html.includes(title));'
            assert source.count(marker) == 1
            source = source.replace(marker, marker + '''
    if (page === "dispatch") {
      const cards = html.match(/<article\\b[\\s\\S]*?<\\/article>/g);
      assert(cards && cards[0].includes('Total Data Antrean Pengiriman') && cards[0].includes('data-icon="database"'), "Total card is first");
    }''')
            source = source.replace('5/7 cards', '5/8 cards, total dispatch card first')
        data = source.encode()
        (root/name).write_bytes(data)
        manifest[name] = hashlib.sha256(data).hexdigest()
        archive.writestr(name, data)
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
deploy = (root/'deployment/deploy-dispatch-info-position-20261013.py').read_text().replace('dispatch-info-position', 'dispatch-total').replace('DEPLOYED_DISPATCH_INFO_POSITION', 'DEPLOYED_DISPATCH_TOTAL')
(root/'deployment/deploy-dispatch-total-20261013.py').write_text(deploy)
print('PACKAGE_READY: first dispatch total card; equal main dashboard card heights and offline device count')
