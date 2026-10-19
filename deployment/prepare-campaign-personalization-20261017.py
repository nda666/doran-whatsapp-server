from pathlib import Path
import sys
sys.stdout.reconfigure(encoding='utf-8')
import base64
import difflib
import hashlib
import json
import re
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
names = ['src/lib/campaignPersonalization.ts', 'src/components/CampaignRecipientData.tsx', 'src/components/MessageTemplatePicker.tsx', 'src/pages/dashboard/campaigns.tsx', 'src/server/campaigns/prepare.ts', 'src/pages/api/campaigns/[id].ts', 'public/templates/campaign-personalisasi.csv', 'deployment/verify-campaign-personalization.cjs']
names.append('deployment/verify-campaign-personalization-live.cjs')
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', str(Path.home()/'.ssh/codex_wa_server_ed25519'), 'jeblast@103.196.146.186']
remote = "from pathlib import Path\nimport base64,json\na=Path('/home/jeblast/repos/doran-whatsapp-server')\nnames=" + repr(names) + "\nprint(json.dumps({n:base64.b64encode((a/n).read_bytes()).decode() if (a/n).is_file() else None for n in names}))"
result = subprocess.run(ssh + ['python3', '-'], input=remote.encode(), capture_output=True, check=True)
payload = {name: (root/name).read_bytes() for name in names}
# Shared local files also contain an unreleased sticker feature. Keep it local.
dashboard = payload['src/pages/dashboard/campaigns.tsx'].decode().replace('\r\n', '\n')
dashboard = re.sub(r'^.*(?:import Sticker|const \[stickerBusy|const \[uploadedStickers|const selectedMediaId|const messageType =|const mediaOptions =).*\n', '', dashboard, flags=re.M)
dashboard = dashboard.replace('messageType === "sticker" ? "" : watchedMessage || ""', 'watchedMessage || ""')
dashboard = dashboard.replace('message: values.messageType === "sticker" ? "" : values.message, ', '')
dashboard = dashboard.replace('messageType: "message", ', '').replace('messageType: audience.messageType || "message", ', '')
dashboard = dashboard.replace(' && !stickerBusy', '').replace('stickerBusy || ', '').replace(' || stickerBusy', '')
dashboard = re.sub(r'^.*<Form.Item name="messageType".*\n', '', dashboard, flags=re.M)
dashboard = dashboard.replace('        {messageType !== "sticker" && <>\n', '').replace('        </>}\n', '')
dashboard = re.sub(r'^.*<Form.Item name="mediaId".*\n', '        <Form.Item name="mediaId" label="Media dari File Manager"><Select allowClear options={(media.data?.data || []).map((m: any) => ({ value: m.id, label: m.name }))} /></Form.Item>\n', dashboard, flags=re.M)
dashboard = re.sub(r'        \{messageType === "sticker" && <Space.*?</Space>}\n', '', dashboard, flags=re.S)
dashboard = dashboard.replace('["message", "messageType"]', '["message"]')
assert not any(word in dashboard for word in ['stickerBusy', 'StickerPreview', 'StickerPhotoUpload', 'messageType', 'uploadedStickers'])
payload['src/pages/dashboard/campaigns.tsx'] = dashboard.encode()
remote_sources = json.loads(result.stdout)
prepare = base64.b64decode(remote_sources['src/server/campaigns/prepare.ts']).decode().replace('\r\r\n', '\n').replace('\r\n', '\n')
prepare = prepare.replace('import { normalizePhoneRecipient } from "../../utils/normalizePhoneRecipient";', 'import { normalizePhoneRecipient } from "../../utils/normalizePhoneRecipient";\nimport { campaignRecipientSchema, mergeCampaignRecipients, renderCampaignMessage } from "../../lib/campaignPersonalization";')
prepare = prepare.replace('z.array(z.object({ number: z.string().max(100), name: z.string().max(200).default("") }))', 'z.array(campaignRecipientSchema)')
prepare = prepare.replace('  const targets = new Map<string, string>();\n  for (const target of [...contacts, ...input.recipients]) targets.set(normalizePhoneRecipient(target.number), target.name);', '  const targets = mergeCampaignRecipients(contacts, input.recipients);')
prepare = prepare.replace('targets.size', 'targets.length')
prepare = prepare.replace('return Array.from(targets, ([recipient, name], index) => {', 'return targets.map((target, index) => {\n    const recipient = normalizePhoneRecipient(target.number);')
prepare = prepare.replace('input.message.replace(/\\{nama\\}/g, name || recipient).replace(/\\{nomor\\}/g, recipient)', 'renderCampaignMessage(input.message, target)')
assert 'renderCampaignMessage(input.message, target)' in prepare and 'new Map<string, string>' not in prepare
payload['src/server/campaigns/prepare.ts'] = prepare.encode()
edit = base64.b64decode(remote_sources['src/pages/api/campaigns/[id].ts']).decode().replace('\r\r\n', '\n').replace('\r\n', '\n')
assert 'export const config' not in edit
payload['src/pages/api/campaigns/[id].ts'] = (edit + '\nexport const config = { api: { bodyParser: { sizeLimit: "3mb" } } };\n').encode()
test = payload['deployment/verify-campaign-personalization.cjs'].decode()
test = test.replace("  const sticker = campaignJobs", "  if ('messageType' in input()) {\n  const sticker = campaignJobs")
test = test.replace("assert.equal(sticker[0].payload.kind, 'sticker');", "assert.equal(sticker[0].payload.kind, 'sticker');\n  }")
payload['deployment/verify-campaign-personalization.cjs'] = test.encode()
baseline, manifest = {}, {}
for name, encoded in json.loads(result.stdout).items():
    old = base64.b64decode(encoded) if encoded is not None else None
    baseline[name] = hashlib.sha256(old).hexdigest() if old is not None else None
    if old is not None:
        target = root/'tmp/campaign-personalization-live-before'/name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(old)
        print(''.join(difflib.unified_diff(old.decode().replace('\r\r\n', '\n').replace('\r\n', '\n').splitlines(True), payload[name].decode().splitlines(True), fromfile='live/'+name, tofile='package/'+name)))
    target = root/'tmp/campaign-personalization-prepared'/name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload[name])
with zipfile.ZipFile(root/'deployment/campaign-personalization-20261017.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        data = payload[name]
        manifest[name] = hashlib.sha256(data).hexdigest()
        archive.writestr(name, data)
    archive.writestr('baseline.json', json.dumps(baseline))
    archive.writestr('manifest.json', json.dumps(manifest))
print('PACKAGE_READY', len(names), 'files')
