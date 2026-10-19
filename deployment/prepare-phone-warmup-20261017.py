from pathlib import Path
import subprocess, zipfile, io, json, hashlib
root=Path(__file__).resolve().parent.parent
files=['src/components/phone/PhoneFormModal.tsx','src/components/phone/PhonePolicyControls.tsx','src/pages/dashboard/phone.tsx','src/pages/api/phones/index.ts','public/locales/en/interface.json']
key=str(Path.home()/'.ssh/codex_wa_server_ed25519')
code="import io,zipfile,sys; from pathlib import Path; b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); app=Path('/home/jeblast/repos/doran-whatsapp-server'); "+repr(files)+"; "
code="import io,zipfile,sys; from pathlib import Path; b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); app=Path('/home/jeblast/repos/doran-whatsapp-server'); [z.writestr(n,(app/n).read_bytes()) for n in "+repr(files)+"]; z.close(); sys.stdout.buffer.write(b.getvalue())"
result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',key,'jeblast@103.196.146.186','python3 -c '+"'"+code.replace("'", "'\"'\"'")+"'"],check=True,stdout=subprocess.PIPE)
before=root/'tmp/phone-warmup-live-before';before.mkdir(exist_ok=True)
with zipfile.ZipFile(io.BytesIO(result.stdout)) as z:
    z.extractall(before)
baseline={n:hashlib.sha256((before/n).read_bytes()).hexdigest() for n in files}
(root/'deployment/phone-warmup-baseline.json').write_text(json.dumps(baseline))
print('LIVE_BASELINE_FETCHED',len(files))
