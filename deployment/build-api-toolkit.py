"""Generate a shared API catalogue, Postman exports, and the cURL PDF guide."""
from pathlib import Path
from copy import deepcopy
import json
import textwrap
import uuid
import shutil
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://dashboard.jeblast.com'
NUMBER = '{{number}}'
STAMP = '2026-10-10T08:00:00.000Z'
JOB = {'id': 'UUID_PENGIRIMAN', 'recipient': '6281234567890', 'status': 'QUEUED', 'message_id': None, 'attempts': 0, 'error': None, 'created_at': STAMP, 'sent_at': None, 'delivered_at': None, 'read_at': None}
PHONE = {'id': 'UUID_DEVICE', 'name': 'Device Toko Jakarta', 'number': '6281234567890', 'account_name': 'Admin Toko', 'status': 'OPEN', 'isOnline': True, 'active': 1, 'is_save_group': False, 'webhookUrl': None, 'readReceipt': False, 'rejectCall': False, 'showOnline': True, 'showTyping': False, 'createdAt': STAMP, 'updatedAt': STAMP}
ASSET = {'id': 'UUID_MEDIA', 'name': 'Brosur produk', 'originalName': 'brosur.pdf', 'mime': 'application/pdf', 'size': 102400}
entries = []

def endpoint(key, title, path, body, response, *, group='API publik', methods=None, auth='device', status=200, notes='', variants=None, effect=False, encoding='json', errors=None):
    entries.append(dict(key=key, title=title, path=path, body=body, response=response, group=group, methods=methods or ['POST'], auth=auth, status=status, notes=notes, variants=variants or [], effect=effect, encoding=encoding, errors=errors or []))

endpoint('signin','Login untuk token pengguna','/api/signin',{'email':'{{account_email}}','password':'{{account_password}}'},{'token':'TOKEN_USER_CONTOH','email':'akun@example.com','id':'UUID_USER'},group='Autentikasi integrasi',auth='none',notes='Isi email/password akun yang sudah disetujui. Respons token adalah token pengguna, bukan token device. Postman menyimpan token ke user_token setelah HTTP 200. Password/token pada file export kosong; jangan membagikan environment setelah diisi. Maksimal 10 percobaan login per email selama 15 menit.',errors=[{'status':400,'body':{'message':'Email dan password tidak valid'}},{'status':401,'body':{'message':'Email atau password tidak valid'}},{'status':403,'body':{'message':'Akun masih menunggu persetujuan admin.'}},{'status':429,'body':{'message':'Terlalu banyak percobaan login, coba lagi nanti'}}])

public_errors = [
    {'status': 401, 'body': None, 'note': 'Token tidak valid/tidak ada; body kosong.'},
    {'status': 405, 'body': None, 'note': 'Metode selain GET/POST; body kosong.'},
]
send_errors = public_errors + [
    {'status': 400, 'body': {'result': False, 'message': 'Nomor tujuan tidak valid.'}},
    {'status': 409, 'body': {'message': 'Device nonaktif.'}},
    {'status': 409, 'body': {'result': False, 'message': 'ID transaksi sudah digunakan untuk isi berbeda.'}},
    {'status': 503, 'body': {'message': 'Antrean pengiriman belum aktif.'}},
]
send_fields = {
    'send-message': ('Kirim pesan teks', {'message': 'Halo dari Jeblast'}),
    'send-media': ('Kirim media', {'message': 'Brosur produk terbaru', 'media_id': '{{media_id}}'}),
    'send-sticker': ('Kirim sticker', {'media_id': '{{media_id}}'}),
    'send-poll': ('Kirim polling', {'payload': {'name': 'Pilihan Anda?', 'values': ['A', 'B'], 'selectableCount': 1}}),
    'send-button': ('Kirim tombol', {'payload': {'text': 'Pilih layanan', 'buttons': [{'id': 'info', 'text': 'Informasi'}]}}),
    'send-list': ('Kirim daftar pilihan', {'payload': {'text': 'Daftar layanan', 'title': 'Menu', 'buttonText': 'Pilih', 'rows': [{'id': 'info', 'title': 'Informasi', 'description': 'Lihat informasi produk'}]}}),
    'send-location': ('Kirim lokasi', {'payload': {'latitude': -6.2, 'longitude': 106.8, 'name': 'Jakarta'}}),
    'send-vcard': ('Kirim kontak', {'payload': {'name': 'Admin', 'number': NUMBER}}),
}
for action, (title, fields) in send_fields.items():
    body = {'number': NUMBER, 'store_id': '{{store_id}}', 'transaction_id': '{{transaction_id}}', 'message_key': action, **fields}
    response = {'result': True, 'queued': True, 'transaction_id': 'ORDER-20261010-001', 'store_id': 'STORE-001', 'message_key': action, 'deduplication_enabled': True, 'status_url': '/api/send-status', 'data': [JOB], 'message': 'Request tersimpan dalam antrean. Periksa status setiap penerima untuk hasil pengiriman.'}
    note = 'Memerlukan device aktif dan antrean aktif. Respons 202 berarti tersimpan dalam antrean. Status pengiriman diperiksa dengan token device pengirim yang sama. Maksimal 100 penerima per request; nomor dipisahkan koma. Gunakan ID store/transaksi/message_key yang stabil untuk retry.'
    if action in ['send-media', 'send-sticker']:
        note += ' media_id harus berasal dari File Manager milik akun pemilik device. Upload memakai token pengguna.'
    if action == 'send-sticker': note += ' Sticker wajib MIME image/webp.'
    if action in ['send-button', 'send-list']: note += ' Tampilan tombol/daftar bergantung dukungan versi WhatsApp penerima.'
    if action == 'send-poll': note += ' 2-12 pilihan unik; selectableCount 1 sampai jumlah pilihan.'
    endpoint(action, title, '/api/public/'+action, body, response, methods=['POST', 'GET'], status=202, notes=note, effect=True, encoding='public', errors=send_errors)

endpoint('session', 'Status sesi device', '/api/public/session', {}, {'active': True, 'online': True, 'name': 'Admin Toko', 'number': '6281234567890'}, methods=['POST', 'GET'], encoding='public', notes='Menampilkan catatan sesi untuk device pemilik token; dapat dipakai saat device nonaktif.', errors=public_errors)
endpoint('check-number', 'Cek nomor terdaftar di WhatsApp', '/api/public/check-number', {'number': NUMBER}, {'number': '6281234567890', 'registered': True}, methods=['POST', 'GET'], encoding='public', notes='Memeriksa satu nomor tujuan di jaringan WhatsApp, bukan mencari device dalam dashboard. Device pengirim harus aktif, online, dan koneksi WhatsApp diaktifkan.', errors=public_errors+[{'status':409,'body':{'message':'Device offline.'}},{'status':503,'body':{'message':'Koneksi WhatsApp dinonaktifkan.'}}])
endpoint('generate-qr', 'Buat atau ambil QR penautan', '/api/public/generate-qr', {}, {'qr':'DATA_QR_CONTOH','timeout':20000}, methods=['POST','GET'], encoding='public', effect=True, notes='Device harus aktif dan WhatsApp diaktifkan. qr adalah data QR mentah untuk dirender sebagai QR, bukan PNG/base64. timeout dalam milidetik; nilai mengikuti sisa masa berlaku. Maksimal waktu tunggu server 20 detik. Respons pairing dapat tidak menyertakan timeout pada jalur pairing awal.', variants=[{'status':200,'body':{'connected':True,'timeout':0}},{'status':200,'body':{'pairing':True}},{'status':200,'body':{'pairing':True,'timeout':0}}], errors=public_errors+[{'status':409,'body':{'message':'Device nonaktif.'}},{'status':503,'body':{'message':'Koneksi WhatsApp dinonaktifkan.'}}])
endpoint('disconnect', 'Putuskan dan nonaktifkan device', '/api/public/disconnect', {}, {'result':True}, methods=['POST','GET'], encoding='public', effect=True, notes='Mengubah active menjadi 0, status CLOSE, dan menutup socket. Untuk menghubungkan kembali, aktifkan device melalui dashboard. Gunakan POST untuk operasi ini.', errors=public_errors)
phone_errors=public_errors+[{'status':400,'body':{'result':False,'message':'number wajib diisi dengan satu nomor WhatsApp yang valid.'}},{'status':403,'body':{'result':False,'message':'Akun belum disetujui admin atau telah ditolak.'}},{'status':404,'body':{'result':False,'message':'Nomor WhatsApp tidak ditemukan dalam data yang dapat diakses.'}},{'status':500,'body':{'result':False,'message':'Detail device gagal diambil. Silakan coba lagi.'}}]
access={'role':'USER','scope':'own'}
admin_phone={**PHONE,'token':'TOKEN_DEVICE_CONTOH','userId':'UUID_OWNER','user':{'id':'UUID_OWNER','name':'Pemilik Toko','email':'owner@example.com'}}
access_notes='Token device menentukan pemilik akun di database. Admin utama admin@gmail.com dengan role ADMIN dan status APPROVED mendapat seluruh akun (scope all), lainnya hanya akun sendiri (scope own). Token API disertakan sebagai field token hanya untuk admin utama; pengguna lain tidak mendapat token. QR tidak disertakan. Admin juga mendapat userId dan user {id,name,email}. Status koneksi berasal dari catatan terakhir server.'
endpoint('list-phones','Seluruh device dan detail','/api/public/list-phones',{}, {'result':True,'access':access,'total':1,'data':[PHONE]},methods=['POST','GET'],encoding='public',notes=access_notes+' Tanpa pagination; device belum tertaut memiliki number null.',variants=[{'status':200,'body':{'result':True,'access':{'role':'ADMIN','scope':'all'},'total':1,'data':[admin_phone]}}],errors=[e for e in phone_errors if e['status'] not in [400,404]])
endpoint('phone-detail','Detail satu nomor WhatsApp','/api/public/phone-detail',{'number':NUMBER},{'result':True,'access':access,'number':'6281234567890','total':1,'data':[PHONE]},methods=['POST','GET'],encoding='public',notes=access_notes+' number wajib satu nomor. Format 08, 62, +62, spasi, kurung, dan tanda hubung diterima. Bila ada beberapa device dengan nomor sama, data berisi semua yang dapat diakses.',variants=[{'status':200,'body':{'result':True,'access':{'role':'ADMIN','scope':'all'},'number':'6281234567890','total':1,'data':[admin_phone]}}],errors=phone_errors)

endpoint('send-status','Status pengiriman per transaksi','/api/send-status',{'store_id':'{{store_id}}','transaction_id':'{{transaction_id}}','message_key':'{{message_key}}','page':1},{'result':True,'total':1,'page':1,'data':[{**JOB,'status':'DELIVERED','message_id':'WA_MESSAGE_ID','attempts':1,'sent_at':STAMP,'delivered_at':STAMP}]},group='Status pengiriman',methods=['POST','GET'],notes='Hasil dibatasi pada device pemilik token, termasuk untuk admin. Gunakan token yang sama dengan saat mengirim. Maksimal 100 data per halaman, page mulai 1. Omit message_key untuk seluruh jenis pesan transaksi. Hasil belum ada: total 0 dan data []. Alternatif parameter id=UUID_PENGIRIMAN mengalahkan pencarian transaksi.',variants=[{'status':200,'body':{'result':True,'total':0,'page':1,'data':[]}}],errors=[{'status':401,'body':{'result':False,'message':'Token tidak valid.'}},{'status':400,'body':{'result':False,'message':'Isi id pekerjaan atau transaction_id.'}}])
endpoint('send-status-job','Status pengiriman per ID pekerjaan','/api/send-status',{'id':'{{dispatch_id}}','page':1},{'result':True,'total':1,'page':1,'data':[JOB]},group='Status pengiriman',methods=['GET','POST'],notes='Gunakan id dari data[].id pada respons pengiriman. Postman menyimpan data[0].id ke dispatch_id setelah kirim sukses. Token harus sama dengan device pengirim. Bila pekerjaan tidak ditemukan dalam device tersebut, total 0 dan data [].',errors=[{'status':401,'body':{'result':False,'message':'Token tidak valid.'}},{'status':400,'body':{'result':False,'message':'Isi id pekerjaan atau transaction_id.'}}])
legacy_body={'api_key':'{{device_token}}','number':NUMBER,'message':'Halo dari Jeblast','store_id':'{{store_id}}','transaction_id':'{{transaction_id}}','message_key':'{{message_key}}'}
legacy_response={'result':True,'queued':True,'transaction_id':'ORDER-20261010-001','store_id':'STORE-001','message_key':'send-message','deduplication_enabled':True,'status_url':'/api/send-status','data':[JOB],'message':'Request tersimpan dalam antrean. Periksa status setiap penerima untuk hasil pengiriman.'}
legacy_errors=[{'status':200,'body':{'result':False,'message':'Token tidak valid'}},{'status':400,'body':{'result':False,'message':'Nomor tujuan tidak valid.'}},{'status':409,'body':{'result':False,'message':'Perangkat nonaktif. Aktifkan sebelum mengirim.'}},{'status':503,'body':{'result':False,'message':'Request belum tersimpan. Ulangi dengan ID transaksi yang sama.'}}]
for key,path in [('legacy-send','/api/send-message'),('v2-send','/api/v2/send-message')]:
    endpoint(key,'Kirim teks/gambar ('+('utama' if key=='legacy-send' else 'v2')+')',path,legacy_body,legacy_response,group='API pengiriman kompatibel',auth='body-device',effect=True,notes='api_key wajib dalam body JSON; header Bearer saja tidak diterima oleh endpoint ini. Saat antrean aktif respons sukses HTTP 200 (berbeda dari API publik 202). image opsional berupa URL HTTP/S atau base64 maksimal 700 KB. Teks maksimal 10.000 karakter; maksimal 100 penerima. Respons mode antrean ini mengikuti konfigurasi produksi saat panduan dibuat.',errors=legacy_errors)
endpoint('dry-run','Validasi tanpa mengirim (dry run)','/api/send-message',{**legacy_body,'dry_run':True},{'result':True,'dry_run':True,'whatsapp_enabled':True,'active':True,'online':True,'recipient_count':1,'queue_enabled':True,'deduplication_enabled':True,'message':'Request dan token valid. Tidak ada pesan yang dikirim.'},group='API pengiriman kompatibel',auth='body-device',notes='dry_run harus boolean true, bukan string. Memvalidasi token/request tanpa menyimpan pekerjaan atau mengirim pesan. Nilai flags/status mengikuti kondisi aktual server.',errors=[error for error in legacy_errors if error['status'] in [200,400]])
endpoint('group-message','Kirim pesan grup (legacy)','/api/send-group-message',{'api_key':'{{device_token}}','id_group':'{{group_id}}','message':'Halo grup'}, {'result':True,'data':{'key':{'id':'WA_MESSAGE_ID','remoteJid':'120363000000000000@g.us','fromMe':True}}},group='API pengiriman kompatibel',auth='body-device',effect=True,notes='Pengiriman langsung, tidak memakai antrean durable atau dedupe transaksi. data berisi satu objek WAMessage dari transport; contoh hanya bagian key, field lain bergantung WhatsApp. id_group adalah ID grup berakhiran @g.us, bukan nomor HP.',errors=[{'status':200,'body':{'result':False,'message':'Token tidak valid'}},{'status':500,'body':{'status':False,'response':'group ID number not included'}}])
endpoint('attachment','Kirim lampiran (legacy)','/api/send-attachment',{'api_key':'{{device_token}}','number':NUMBER,'caption':'Brosur produk','file':'{{file_path}}'},{'result':True,'data':[{'key':{'id':'WA_MESSAGE_ID','remoteJid':'6281234567890@s.whatsapp.net','fromMe':True}}]},group='API pengiriman kompatibel',auth='body-device',encoding='multipart',effect=True,notes='multipart/form-data, bukan JSON. Pilih berkas lokal pada field file di Postman; path berkas tidak ikut tersimpan dalam export. Jangan isi header Content-Type manual agar boundary benar. Pengiriman langsung, tanpa antrean/dedupe durable. data adalah WAMessage (contoh hanya key). Gambar, video, audio, dan PDF ditangani oleh transport legacy.',errors=[{'status':200,'body':{'result':False,'message':'Token tidak valid'}},{'status':503,'body':{'message':'Koneksi WhatsApp dinonaktifkan sementara.'}}])
endpoint('media-list','Daftar media File Manager','/api/media',{'page':1,'limit':10},{'data':[{**ASSET,'createdAt':STAMP}],'total':1},group='Media pendukung',methods=['GET'],auth='user',notes='Memerlukan token pengguna (bukan token device). page dan limit opsional; options=1 memberikan opsi sampai 1.000 file. Admin utama mengikuti cakupan seluruh akun. File untuk send-media tetap harus milik akun device pengirim.',errors=[{'status':401,'body':{'message':'Unauthorized'}}])
endpoint('media-upload','Upload media File Manager','/api/media',{'file':'{{file_path}}','labels':'["Brosur produk"]'},{'data':[ASSET],'message':'1 file tersimpan.'},group='Media pendukung',auth='user',encoding='multipart',status=201,effect=True,notes='Maksimal 10 file, 25 MB/file, total 100 MB. labels adalah string JSON array berisi satu label per file. Contoh memakai satu file. Bila labels tidak diberikan, respons berupa objek file pertama (bukan data array). Simpan id sebagai media_id untuk pengiriman.',errors=[{'status':400,'body':{'message':'Unggahan gagal. Isi label tiap file; maksimal 10 file, 25 MB/file dan total 100 MB. Gunakan format yang didukung.'}}])
endpoint('media-download','Ambil berkas media','/api/media/{{media_id}}',{},'BERKAS_BINER_SESUAI_MIME',group='Media pendukung',methods=['GET'],auth='user',notes='Respons berupa berkas biner, bukan JSON. Content-Type mengikuti MIME; gambar/video/audio inline, lainnya attachment. Content-Disposition memakai nama file asli. Pada cURL tambahkan --output hasil-file.pdf.',errors=[{'status':404,'body':None,'note':'File tidak ditemukan/tidak dapat diakses; body kosong.'}])
endpoint('media-label','Ubah label media','/api/media/{{media_id}}',{'name':'Brosur terbaru'},{'message':'Label file tersimpan.'},group='Media pendukung',methods=['PATCH'],auth='user',effect=True,notes='name adalah label, bukan nama berkas asli. Maksimal 255 karakter.',errors=[{'status':400,'body':{'message':'Label file wajib diisi (maksimal 255 karakter).'}},{'status':404,'body':None}])
endpoint('media-delete','Hapus media','/api/media/{{media_id}}',{}, {'result':True},group='Media pendukung',methods=['DELETE'],auth='user',effect=True,notes='Menghapus file dan metadata. Ditolak bila file masih dipakai riwayat atau antrean.',errors=[{'status':409,'body':{'message':'File masih dipakai dalam riwayat/antrean.'}},{'status':404,'body':None}])
endpoint('dashboard-phones','Daftar Device dashboard (token pengguna)','/api/phones',{'page':1,'limit':10,'sort':'createdAt','order':'desc'},{'data':[{**PHONE,'token':'TOKEN_DEVICE_CONTOH','userId':'UUID_OWNER','sentCount':0}],'total':1,'page':1,'pageSize':10},group='Device pendukung',methods=['GET'],auth='user',notes='API tabel dashboard, memakai token pengguna. Admin utama mendapat seluruh device beserta user {id,name,email}; pengguna lain hanya miliknya. Respons dashboard menyertakan token device untuk fitur Copy, API publik list-phones/phone-detail menyertakan token hanya untuk admin utama. Admin dapat sort=user.name. Ini bukan endpoint anonim.',errors=[{'status':401,'body':{'message':'Unauthorized'}}])
endpoint('device-options','Opsi Device dashboard','/api/phones',{'options':'1'},[{'id':'UUID_DEVICE','name':'Device Toko Jakarta','number':'6281234567890','active':1,'isOnline':True}],group='Device pendukung',methods=['GET'],auth='user',notes='Daftar ringkas, maksimal 1.000 device sesuai hak akses akun. Tidak memuat token atau detail pemilik.',errors=[{'status':401,'body':{'message':'Unauthorized'}}])

device_note = 'Token device menerima Authorization: Bearer TOKEN atau api_key pada body/form-data/query. Header Bearer diprioritaskan. URL dengan dan tanpa /public memakai handler dan respons yang sama.'
for entry in entries:
    if entry['auth'] in ['device', 'body-device']:
        entry['notes'] = entry['notes'].replace('api_key wajib dalam body JSON; header Bearer saja tidak diterima oleh endpoint ini.', 'Bearer atau api_key diterima.').replace('Saat antrean aktif respons sukses HTTP 200 (berbeda dari API publik 202).', 'Saat antrean aktif respons sukses HTTP 200 pada kedua URL.') + ' ' + device_note
        if entry['key'] in ['legacy-send', 'v2-send']:
            entry['methods'] = ['POST', 'GET']
for entry in entries:
    if entry['key'] == 'send-message':
        entry['response'] = deepcopy(legacy_response)
        entry['status'] = 200
        entry['errors'] = deepcopy(legacy_errors)
        entry['notes'] = 'Respons HTTP 200 dengan queued=true berarti masuk antrean, belum terkirim. Mendukung GET/POST dan dry_run=true (boolean pada JSON). ' + device_note

for entry in entries:
    if entry['auth'] not in ['device', 'body-device']:
        continue
    entry['notes'] += ' Kegagalan API menyertakan curl_error=null; error cURL sebenarnya dicatat oleh klien PHP.'
    for error in entry['errors']:
        body = error.get('body') or {'message': 'Token tidak valid.' if error['status'] == 401 else 'Metode tidak diizinkan.' if error['status'] == 405 else 'Request gagal.'}
        body.update(result=False, curl_error=None)
        if 'message' not in body:
            body['message'] = body.get('response', 'Request gagal.')
        error['body'] = body
        if 'note' in error and 'kosong' in error['note']:
            del error['note']

# Keep request identity distinct from the internal delivery ID for each recipient.
queued_keys = set(send_fields) | {'legacy-send', 'v2-send'}
job_notes = (' Nomor penerima diperiksa berdasarkan format dasar dan kode negara, bukan kecocokan pola operator atau panjang nomor terkini. Nomor lama yang dapat dinormalisasi tetap dicoba ke WhatsApp; diterimanya request tidak membuktikan nomor terdaftar atau pesan sampai. job_id opsional: string stabil 1-128 karakter tanpa karakter kontrol; spasi awal/akhir dihapus dan ID peka huruf besar/kecil. '
    'Cakupan satu device, berlaku lintas endpoint pengiriman antrean. Retry dengan ID yang sudah ada mengembalikan existing=true '
    'dan status seluruh penerima asli tanpa memvalidasi ulang nomor/payload atau membuat pengiriman baru. Gunakan ID baru untuk pesan baru. '
    'Konfirmasi WhatsApp yang belum valid ditunggu hingga 40 detik, kemudian diulang otomatis dengan jeda 1, 2, 4, lalu 8 menit; maksimal 5 percobaan, lalu FAILED. Selama menunggu ulang status QUEUED dengan error ACK_TIMEOUT_RETRY; next_attempt_at berisi jadwal berikutnya. Konfirmasi terlambat membatalkan pengulangan. Penolakan WhatsApp kode 463 langsung FAILED tanpa pengulangan. Ada risiko pesan ganda. FAILED/UNCERTAIN tidak diulang otomatis. Perlindungan berlaku selama catatan dispatch tersimpan. '
    'Tanpa job_id, dedupe memakai device/store_id/transaction_id/message_key/penerima; perubahan isi pada kunci yang sama ditolak 409. '
    'store_id default default (maksimal 64 karakter), transaction_id otomatis UUID (maksimal 128), message_key default default (maksimal 64). '
    'Retry tanpa job_id maupun transaction_id stabil dapat membuat pengiriman baru.')
for entry in entries:
    if entry['key'] in queued_keys:
        entry['body'] = {'job_id': '{{job_id}}', **entry['body']}
        entry['response'] = {**entry['response'], 'job_id': 'ORDER-20261011-001-notification', 'existing': False}
        previous = deepcopy(entry['response'])
        previous.update(existing=True, data=[{**JOB, 'status': 'READ', 'message_id': 'WA_MESSAGE_ID', 'attempts': 1,
            'sent_at': STAMP, 'delivered_at': STAMP, 'read_at': STAMP}],
            message='Job sudah tersimpan. Berikut status terakhir; tidak ada pengiriman baru.')
        entry['variants'].append({'status': entry['status'], 'body': previous})
        entry['notes'] += job_notes + ' Simpan data[].id sebagai ID Pengiriman setiap penerima. Untuk cek satu pengiriman, POST /api/send-status dengan id=data[].id dan token device pengirim yang sama. Webhook memakai dispatch.id yang sama dengan data[].id. job_id adalah ID request dari aplikasi pengirim; satu job_id dapat mencakup beberapa penerima.'
        entry['errors'].append({'status': 400, 'body': {'result': False, 'curl_error': None,
            'message': 'job_id harus berupa string 1–128 karakter tanpa karakter kontrol.'}})
    if entry['key'] == 'send-message':
        entry['notes'] += ' image opsional URL HTTP/S atau base64 maksimal 700 KB; pesan maksimal 10.000 karakter, maksimal 100 penerima. dry_run hanya aktif untuk POST JSON dengan boolean true; GET/form mengirim string dan tidak mengaktifkan dry run.'
    if entry['key'] in {'legacy-send', 'v2-send'}:
        entry['errors'].append({'status': 503, 'body': {'result': False, 'curl_error': None,
            'message': 'job_id membutuhkan antrean pengiriman aktif.'}})
    if entry['key'] == 'dry-run':
        entry['body']['job_id'] = '{{job_id}}'
        entry['notes'] += ' Gunakan POST JSON saja: string true pada GET/form tidak mengaktifkan dry run. job_id tidak disimpan; job_id tetap memerlukan antrean aktif.'
        entry['errors'].append({'status': 503, 'body': {'result': False, 'curl_error': None,
            'message': 'job_id membutuhkan antrean pengiriman aktif.'}})
    if entry['key'] == 'send-status-job':
        entry['title'] = 'Status satu penerima per ID Pengiriman (data[].id)'
        entry['body']['id'] = '{{dispatch_id}}'
        entry['notes'] = 'ID Pengiriman adalah data[].id pada respons kirim dan dispatch.id pada webhook. Untuk cek satu penerima, kirim nilainya sebagai field id; jangan masukkan data[].id ke field job_id. job_id adalah ID request dari aplikasi pengirim. Postman menyimpan data[0].id ke dispatch_id. Token device pengirim yang sama diperlukan. Hasil tidak ditemukan: total 0 dan data []. ' + device_note
    if entry['key'] in {'send-status', 'send-status-job'}:
        for error in entry['errors']:
            if error['status'] == 400:
                error['body']['message'] = 'Isi job_id, id pekerjaan, atau transaction_id.'
    if entry['key'] == 'group-message':
        entry['errors'][1]['body']['message'] = 'ID grup wajib diisi.'

endpoint('send-status-request', 'Status seluruh penerima per job_id klien', '/api/send-status',
    {'job_id': '{{job_id}}', 'page': 1}, {'result': True, 'job_id': 'ORDER-20261011-001-notification', 'total': 1, 'page': 1, 'data': [JOB]},
    group='Status pengiriman', methods=['POST', 'GET'],
    notes='job_id adalah ID request buatan klien, bukan data[].id. Prioritas lookup: job_id > id > transaction_id. Hanya device pemilik token, termasuk admin. Maksimal 100 per halaman, page mulai 1. Gunakan page berikutnya hingga seluruh total terbaca. ' + device_note,
    variants=[{'status': 200, 'body': {'result': True, 'job_id': 'ORDER-20261011-001-notification', 'total': 0, 'page': 1, 'data': []}}],
    errors=[{'status': 401, 'body': {'result': False, 'curl_error': None, 'message': 'Token tidak valid.'}},
        {'status': 400, 'body': {'result': False, 'curl_error': None, 'message': 'job_id harus berupa string 1–128 karakter tanpa karakter kontrol.'}}])

catalog = {'version':'2026-10-11','baseUrl':BASE,'scope':'Seluruh API integrasi di API Docs, login untuk token pengguna, endpoint pengiriman kompatibel, serta API media/device pendukung. Endpoint internal campaign, kontak, admin, session/OAuth, dan diagnostik dashboard tidak termasuk paket integrasi ini.','endpoints':entries}
(ROOT/'src/data').mkdir(parents=True,exist_ok=True)
(ROOT/'src/data/apiDocumentation.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')

def compact_value(value):
    if isinstance(value,(dict,list)): return json.dumps(value,ensure_ascii=False,separators=(',',':'))
    if isinstance(value,bool): return 'true' if value else 'false'
    return str(value)

def request_for(entry, method=None, mode=None):
    method=method or entry['methods'][0]
    mode=mode or ('query' if method=='GET' else entry['encoding'])
    body=deepcopy(entry['body']); headers=[]
    auth={'type':'noauth'} if entry['auth'] in ['body-device','none'] else {'type':'bearer','bearer':[{'key':'token','value':'{{user_token}}' if entry['auth']=='user' else '{{device_token}}','type':'string'}]}
    url={'raw':'{{base_url}}'+entry['path'],'host':['{{base_url}}'],'path':entry['path'].strip('/').split('/')}
    result={'method':method,'header':headers,'auth':auth,'url':url,'description':entry['notes']}
    if mode=='query' and body:
        url['query']=[{'key':key,'value':compact_value(value)} for key,value in body.items()]
        from urllib.parse import urlencode
        url['raw']+='?'+urlencode([(key,compact_value(value)) for key,value in body.items()],safe='{}')
    elif mode=='multipart':
        result['body']={'mode':'formdata','formdata':[{'key':key,'type':'file','src':[],'description':'Pilih berkas lokal sebelum Send.'} if key=='file' else {'key':key,'type':'text','value':compact_value(value)} for key,value in body.items()]}
    elif mode=='urlencoded':
        headers.append({'key':'Content-Type','value':'application/x-www-form-urlencoded'})
        result['body']={'mode':'urlencoded','urlencoded':[{'key':key,'value':compact_value(value),'type':'text'} for key,value in body.items()]}
    elif method not in ['GET','DELETE']:
        headers.append({'key':'Content-Type','value':'application/json'})
        result['body']={'mode':'raw','raw':json.dumps(body,ensure_ascii=False,indent=2),'options':{'raw':{'language':'json'}}}
    return result

groups={}; count=0
for entry in entries:
    modes=[(method,'query' if method=='GET' else entry['encoding']) for method in entry['methods']]
    if entry['encoding']=='public': modes.insert(1,('POST','urlencoded'))
    for method,mode in modes:
        request=request_for(entry,method,mode)
        responses=[]
        for example in [{'status':entry['status'],'body':entry['response'],'note':'Contoh sukses ilustratif; nilai bukan data produksi.'}]+entry['variants']+entry['errors']:
            code=example['status']; body=example.get('body')
            responses.append({'name':str(code)+' - '+example.get('note','Contoh respons'),'originalRequest':deepcopy(request),'status':{200:'OK',201:'Created',202:'Accepted',400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',409:'Conflict',500:'Internal Server Error',503:'Service Unavailable'}.get(code,'Response'),'code':code,'header':[] if body is None or isinstance(body,str) else [{'key':'Content-Type','value':'application/json'}],'body':'' if body is None else body if isinstance(body,str) else json.dumps(body,ensure_ascii=False,indent=2)})
        scripts=[]
        if entry['effect']:
            scripts.append({'listen':'prerequest','script':{'type':'text/javascript','exec':[
                "if (pm.variables.get('allow_write_requests') !== 'true') {",
                "  console.warn('Request mengubah data/mengirim pesan. Set allow_write_requests=true sebelum menjalankannya.');",
                "  pm.execution.skipRequest();",
                "}"]}})
        if entry['key'] in queued_keys:
            scripts.append({'listen':'test','script':{'type':'text/javascript','exec':[
                'let result; try { result = pm.response.json(); } catch (_) {}',
                'if (result?.result === true && result?.queued === true) {',
                "  if (result.job_id) pm.environment.set('job_id', result.job_id);",
                "  if (result.data?.[0]?.id) pm.environment.set('dispatch_id', result.data[0].id);",
                "  if (result.transaction_id) pm.environment.set('transaction_id', result.transaction_id);",
                "  try { const body = JSON.parse(pm.variables.replaceIn(pm.request.body.raw)); if (body.message_key) pm.environment.set('message_key', body.message_key); } catch (_) {}",
                '}']}})
        if entry['key']=='media-upload':
            scripts.append({'listen':'test','script':{'type':'text/javascript','exec':["if (pm.response.code === 201) { const body = pm.response.json(); const id = body.data?.[0]?.id || body.id; if (id) pm.environment.set('media_id', id); }"]}})
        if entry['key']=='signin':
            scripts.append({'listen':'test','script':{'type':'text/javascript','exec':["if (pm.response.code === 200) { const body = pm.response.json(); if (body.token) pm.environment.set('user_token', body.token); }"]}})
        item={'name':entry['title']+' | '+method+' '+('form-urlencoded' if mode=='urlencoded' else 'form-data' if mode=='multipart' else 'JSON' if method!='GET' else 'query'),'request':request,'response':responses}
        if scripts: item['event']=scripts
        groups.setdefault(entry['group'],[]).append(item);count+=1
collection={'info':{'name':'Jeblast - API Integrasi Lengkap','description':catalog['scope']+'\n\nImport collection dan environment, pilih environment Jeblast, lalu isi device_token dari kolom Token API Device. user_token hanya untuk API media/device dashboard. Contoh response ilustratif. Token dalam file kosong. allow_write_requests=false melindungi request kirim/upload/ubah/hapus/disconnect/QR pada Runner; set true saat memang ingin menjalankannya. Jangan gunakan Runner untuk seluruh collection di produksi.\n\nToken device menerima Authorization: Bearer TOKEN atau api_key pada body/form-data/query. Header Bearer diprioritaskan. URL dengan dan tanpa /public memakai handler dan respons yang sama. Respons antrean bukan bukti delivery.','schema':'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},'item':[{'name':name,'item':items} for name,items in groups.items()]}
variables={'base_url':BASE,'device_token':'','user_token':'','account_email':'','account_password':'','number':'6281234567890','store_id':'STORE-001','transaction_id':'ORDER-20261011-001','message_key':'send-message','media_id':'UUID_MEDIA_DARI_UPLOAD','job_id':'ORDER-20261011-001-notification','dispatch_id':'UUID_PENGIRIMAN_DARI_DATA_ID','group_id':'120363000000000000@g.us','file_path':'/path/ke/berkas.pdf','allow_write_requests':'false'}
collection['variable']=[{'key':key,'value':value,'type':'string'} for key,value in variables.items()]
environment={'id':str(uuid.uuid5(uuid.NAMESPACE_URL,BASE+'/postman/environment')),'name':'Jeblast Production - isi token Anda','values':[{'key':key,'value':value,'enabled':True,'type':'secret' if key.endswith('_token') or key=='account_password' else 'default'} for key,value in variables.items()],'_postman_variable_scope':'environment','_postman_exported_at':'2026-10-11T08:00:00.000Z','_postman_exported_using':'Jeblast API Docs'}
catalog['postmanRequests']=count
(ROOT/'src/data/apiDocumentation.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
out=ROOT/'output/postman';out.mkdir(parents=True,exist_ok=True)
downloads=ROOT/'public/downloads';downloads.mkdir(parents=True,exist_ok=True)
for name,obj in [('jeblast-api.postman_collection.json',collection),('jeblast-api.postman_environment.json',environment)]:
    (out/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8');shutil.copy2(out/name,downloads/name)

# PDF: each operation has its own chapter; code lines stay inside the content area.
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Preformatted, Table, TableStyle, KeepTogether, CondPageBreak
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleJ',fontName='Helvetica-Bold',fontSize=27,leading=32,textColor=colors.HexColor('#123952'),spaceAfter=16))
styles.add(ParagraphStyle(name='BodyJ',fontName='Helvetica',fontSize=10,leading=15,spaceAfter=9,textColor=colors.HexColor('#233849')))
styles.add(ParagraphStyle(name='HeadingJ',fontName='Helvetica-Bold',fontSize=18,leading=23,spaceAfter=12,textColor=colors.HexColor('#123952')))
styles.add(ParagraphStyle(name='SmallJ',fontName='Helvetica',fontSize=8,leading=11,spaceAfter=7,textColor=colors.HexColor('#476174')))
styles.add(ParagraphStyle(name='CodeJ',fontName='Courier',fontSize=7.3,leading=10,spaceBefore=5,spaceAfter=10,backColor=colors.HexColor('#edf4f8'),borderPadding=8))
def p(text,style='BodyJ'): return Paragraph(escape(text),styles[style])
def code(text):
    lines=[]
    for line in text.splitlines():
        lines.extend(textwrap.wrap(line, width=91,replace_whitespace=False,drop_whitespace=False,break_long_words=True,break_on_hyphens=False) or [''])
    return Preformatted('\n'.join(lines),styles['CodeJ'])
def resolved(value):
    replacement={**variables,'device_token':'TOKEN_DEVICE','user_token':'TOKEN_USER','account_email':'akun@example.com','account_password':'PASSWORD_AKUN_ANDA','media_id':'UUID_MEDIA_DARI_UPLOAD','job_id':'ORDER-20261011-001-notification','dispatch_id':'UUID_PENGIRIMAN_DARI_DATA_ID','file_path':'/path/ke/berkas.pdf'}
    text=json.dumps(value,ensure_ascii=False)
    for key,item in replacement.items(): text=text.replace('{{'+key+'}}',item)
    return json.loads(text)
def curl(entry,method=None,mode=None):
    method=method or entry['methods'][0];mode=mode or ('query' if method=='GET' else entry['encoding'])
    path=resolved(entry['path']);body=resolved(entry['body'])
    parts=[f'curl --request {method}',f'"{BASE}{path}"']
    if entry['auth'] not in ['body-device','none']:parts.append('-H "Authorization: Bearer '+('TOKEN_USER' if entry['auth']=='user' else 'TOKEN_DEVICE')+'"')
    if mode=='query' and body:
        parts[0]='curl --get'
        for key,value in body.items():parts.append("--data-urlencode '"+key+'='+compact_value(value)+"'")
    elif mode=='multipart':
        for key,value in body.items():parts.append("-F '"+key+'='+('@'+value+';type=application/pdf' if key=='file' else compact_value(value))+"'")
    elif mode=='urlencoded':
        for key,value in body.items():parts.append("--data-urlencode '"+key+'='+compact_value(value)+"'")
    elif method not in ['GET','DELETE']:
        parts.append('-H "Content-Type: application/json"');parts.append("--data-raw '"+json.dumps(body,ensure_ascii=False,indent=2)+"'")
    if entry['key']=='media-download':parts.append('--output hasil-file.pdf')
    return ' \\\n  '.join(parts)

pdfout=ROOT/'output/pdf';pdfout.mkdir(parents=True,exist_ok=True)
pdf=pdfout/'jeblast-api-curl-guide.pdf'
story=[Spacer(1,38),p('JEBLAST API','TitleJ'),p('Panduan integrasi cURL\nRequest dan response','HeadingJ'),p('Edisi 11 Oktober 2026 | '+str(len(entries))+' operasi | '+str(count)+' request Postman','BodyJ'),p(BASE,'BodyJ'),Spacer(1,16),p('Isi panduan','HeadingJ'),p(catalog['scope']),p('Seluruh contoh response menggunakan data ilustratif. UUID, nomor, nama, waktu, QR, status koneksi, dan field transport harus diganti/ditafsirkan sesuai hasil aktual. Tidak ada token rahasia atau data akun nyata dalam paket ini.'),p('Contoh cURL memakai sintaks Bash/sh. Di Windows, gunakan Git Bash/WSL atau curl.exe dengan penyesuaian kutip dan pemisah baris.'),PageBreak()]
story += [p('Mulai menggunakan API','HeadingJ'),p('1. Import jeblast-api.postman_collection.json dan jeblast-api.postman_environment.json ke Postman. Pilih environment Jeblast Production, kemudian isi device_token.'),p('2. Ambil token device dari Dashboard > Device > kolom Token API > Copy. Untuk daftar/detail nomor, token salah satu device milik admin utama dapat melihat semua akun; token pengguna biasa hanya akun sendiri.'),p('3. user_token berbeda dari device_token. Token pengguna digunakan API media/dashboard. Paket tidak menyimpan token pengguna. Untuk mendapatkannya, isi account_email/account_password di Postman, lalu jalankan Login untuk token pengguna (/api/signin). Respons token disimpan otomatis ke user_token. Anda juga bisa upload media melalui File Manager dashboard.'),p('4. Isi job_id dengan ID request stabil dari sistem Anda, berbeda dari dispatch_id (data[].id internal per penerima). Postman menyimpan keduanya secara terpisah. Isi number, store_id, transaction_id, media_id, dan group_id sesuai operasi. transaction_id harus tetap sama ketika retry; gunakan message_key berbeda untuk isi pesan berbeda.'),p('5. Request yang mengirim/mengubah data memiliki pengaman Postman: allow_write_requests=false. Ubah menjadi true hanya ketika akan menjalankan request tersebut. Jangan jalankan seluruh collection dengan Runner di produksi.'),p('Autentikasi dan hasil','HeadingJ'),p('Token device menerima Authorization: Bearer TOKEN atau api_key pada body/form-data/query. Header Bearer diprioritaskan. URL dengan dan tanpa /public memakai handler dan respons yang sama. API media/device dashboard: Authorization: Bearer TOKEN_USER.'),p('HTTP 200 queued pada send-message (kedua URL) dan HTTP 202 pada API pengiriman lain berarti pekerjaan tersimpan, bukan terkirim. Periksa result, queued, dan data[].status. Jika transport tidak pasti (UNCERTAIN), periksa penerima sebelum mengirim ulang.'),p('Status antrean: QUEUED, PROCESSING, SENT, DELIVERED, READ, FAILED, UNCERTAIN. SENT adalah ACK server; DELIVERED/READ memerlukan receipt. Device offline dapat menunggu; pekerjaan belum terkirim kedaluwarsa setelah 24 jam.'),p('Kode error dapat berbeda antar endpoint. Error API device berbentuk JSON result=false, message, curl_error=null. curl_error transport dibaca klien PHP, bukan server. send-message dan API legacy dapat mengembalikan HTTP 200 dengan result=false. Jangan hanya memeriksa status HTTP.'),PageBreak(),p('Daftar operasi','HeadingJ')]
for index,entry in enumerate(entries,1):story.append(p(f'{index:02d}. {entry["title"]} | {" / ".join(entry["methods"])} {entry["path"]}','SmallJ'))
story.append(PageBreak())
for index,entry in enumerate(entries,1):
    story += [KeepTogether([p(f'{index:02d}. {entry["title"]}','HeadingJ'),p(entry['group']+' | '+' / '.join(entry['methods'])+' '+entry['path'],'SmallJ'),p(entry['notes']),p('Request cURL','Heading2'),code(curl(entry))])]
    if entry['body'] and (entry['encoding']=='multipart' or entry['methods'][0]=='GET'):
        story += [KeepTogether([p('Body JSON / parameter query / field form-data','Heading2'),code(json.dumps(resolved(entry['body']),ensure_ascii=False,indent=2))])]
    story += [KeepTogether([p('Contoh response sukses - HTTP '+str(entry['status']),'Heading2'),code(entry['response'] if isinstance(entry['response'],str) else json.dumps(entry['response'],ensure_ascii=False,indent=2))])]
    for variant in entry['variants']:story += [KeepTogether([p('Variasi sukses - HTTP '+str(variant['status']),'Heading3'),code(json.dumps(variant['body'],ensure_ascii=False,indent=2))])]
    if entry['errors']:
        cells=[[p('HTTP','SmallJ'),p('Body / keterangan','SmallJ')]]
        for error in entry['errors']:
            text='(body kosong)' if error.get('body') is None else json.dumps(error['body'],ensure_ascii=False,separators=(',',':'))
            if error.get('note'):text+=' '+error['note']
            cells.append([p(str(error['status']),'SmallJ'),p(text,'SmallJ')])
        table=Table(cells,colWidths=[40,471],repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#edf4f8')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),0.5,colors.HexColor('#cadbe5')),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6)]))
        story.append(KeepTogether([p('Contoh response error','Heading2'),table]))
    story.append(Spacer(1,22))
story += [PageBreak(),p('Alur integrasi yang dianjurkan','HeadingJ'),p('Teks: session -> POST JSON send-message dengan job_id stabil -> simpan job_id dan data[].id secara terpisah -> cek satu penerima dengan send-status id=data[].id, atau seluruh penerima request dengan job_id, memakai token pengirim yang sama -> tangani status tiap penerima. Lookup job_id lebih diutamakan daripada id/transaction_id. Retry ID yang sama tidak membuat pengiriman baru meskipun nomor/payload berubah.'),p('Media: upload /api/media memakai token pengguna -> simpan media_id -> kirim /api/public/send-media atau send-sticker memakai token device -> periksa /api/send-status.'),p('Inventaris: list-phones -> baca access.scope -> phone-detail dengan number. Dalam cakupan all, gunakan userId/user untuk mengelompokkan kepemilikan.'),p('QR: aktifkan device di dashboard -> generate-qr -> render qr sebagai QR -> tunggu connected/pairing -> cek session. Penautan memerlukan tindakan pemilik HP.'),p('Referensi implementasi','HeadingJ'),p('Panduan disusun dari handler aplikasi dan API Docs Jeblast pada tanggal edisi ini. Dokumentasi live: '+BASE+'/dashboard/api-docs'),p('Contoh bahasa dan berkas unduhan tersedia di halaman API Docs. Bahasa yang disediakan: cURL, PHP cURL, JavaScript fetch (browser/Node.js), Python requests, dan Go net/http.'),p('Catatan: contoh JavaScript untuk server dapat memakai environment variable. Hindari menanam token dalam kode frontend yang dibagikan. Upload menggunakan multipart; respons file dibaca sebagai biner, bukan JSON.')]
def footer(canvas,doc):
    canvas.saveState();width,height=A4
    canvas.setStrokeColor(colors.HexColor('#dce7ee'));canvas.line(42,36,width-42,36)
    canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#476174'))
    canvas.drawString(42,23,'Jeblast API | cURL request & response | 11 Oktober 2026')
    canvas.drawRightString(width-42,23,str(doc.page));canvas.restoreState()
SimpleDocTemplate(str(pdf),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=40,bottomMargin=49,title='Jeblast API - Panduan cURL Request dan Response',author='Jeblast',allowSplitting=1).build(story,onFirstPage=footer,onLaterPages=footer)
shutil.copy2(pdf,downloads/pdf.name)
print(json.dumps({'operations':len(entries),'postman_requests':count,'pdf':str(pdf)},ensure_ascii=False))
