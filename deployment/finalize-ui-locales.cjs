const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'tmp/localization');
const overrides=require('./ui-local-overrides.cjs');
const approved=JSON.parse(fs.readFileSync(path.join(dir,'approved-source-2427.json'),'utf8'));
const arPath=path.join(dir,'ar-cache.json'),ar=JSON.parse(fs.readFileSync(arPath,'utf8'));
const missingArabic=approved.filter(s=>!ar[s]);
const arabic=[
  'تأكد من إدخال المفتاح ومعرّف النموذج وتفعيل الإضافة وحفظ الإعدادات. إذا لم يكن التشفير جاهزًا، تواصل مع مسؤول Doran WA.',
  'قلب مكسور', 'قوس قزح ألوان', 'المستلم', 'مهم تعجب',
  'تم تعطيل التخزين التلقائي لبيانات المجموعات.', 'لكل جهاز.', 'أجهزة · تنتهي الصلاحية', 'تنبيه تحذير',
  'تحقق من أن المفتاح صادر عن المزوّد المحدد وما زال نشطًا ومسموحًا له باستخدام النموذج. انسخه مجددًا إذا كان غير مكتمل.',
  'تحقق من الحصة أو الرصيد المتبقي في موقع المزوّد. إذا تجاوزت الحد لكل دقيقة، انتظر وأعد المحاولة. تُجدد حصة Doran WA اليومية الساعة 00:00 WIB.',
  'سؤال استفسار', 'رسائل', 'رسائل أُرسلت خلال هذه الفترة', 'phone-detail',
  'لا يزال phone-detail يتطلب number.', 'بيتزا طعام', 'pm2 describe doran-whatsapp', 'pm2 save',
  'pm2 startOrReload ecosystem.config.js --only doran-whatsapp --update-env', 'هاتف جوال واتساب',
  'qr هو بيانات QR خام لعرضها كرمز QR، وليس PNG/base64.',
  'تظهر queued=true أيضًا عند إعادة محاولة مهمة مكتملة؛ اقرأ حالة كل مستلم.',
  'طلبات Postman. عنوان URL الأساسي:',
  'الطلبات، بما فيها token user + device_id لإرسال الرسائل وفحص الحالة. لا يزال PDF يتضمن أمثلة تكامل برمز الجهاز.',
  'منزل عنوان',
  'عندما يستقبل رقم الجهاز رسالة من مجموعة WhatsApp، يحفظ Jeblast المجموعة غير المسجلة بعد، بما في ذلك المعرّف والاسم والوصف وقائمة الأعضاء.',
  'خطأ إلغاء فشل', 'مصافحة اتفاق', 'حتى جميع', 'حزن خيبة أمل', 'حزن بكاء',
  'تكون دائمًا null في الخادم؛ تُقرأ أخطاء DNS والاتصال وTLS ومهلة cURL باستخدام',
  'تهنئة حفلة احتفال', 'حماس قبضة', 'حماس قوة', 'جميع أرقام كل المالكين', 'جميع أرقامك',
  'سعادة ابتسامة عريضة', 'ابتسامة عريضة', 'ابتسامة ودية خجولة', 'مئة مثالي', 'بعد الإرسال.',
  'القيمة الافتراضية لـ store_id هي default (64 حرفًا كحد أقصى)، وtransaction_id هو UUID تلقائي (128 حرفًا كحد أقصى)، والقيمة الافتراضية لـ message_key هي default (64 حرفًا كحد أقصى).',
  'إعجاب حب', 'يد توقف', 'تاريخ جدول تقويم', 'شاي مشروب', 'هاتف اتصال',
  'الصق المفتاح كاملًا الذي نسخته، دون إضافة مسافات أو علامات اقتباس. يستخدم كل مزوّد مفتاحه الخاص.',
  'تصفيق تهنئة', 'تمت قراءتها.', 'شكرًا رجاءً عفوًا دعاء', 'دهشة مفاجأة', 'ضحك', 'ضحك بكاء مرح',
  'لا يزال يتطلب قائمة انتظار نشطة.', 'عدم موافقة', 'نوم نعاس',
  'timeout بالمللي ثانية؛ تتبع القيمة مدة الصلاحية المتبقية.',
  'الرموز هي أجزاء النص التي يحسبها الذكاء الاصطناعي. للاختبار الأول اترك القيمة الافتراضية 1024. إذا انقطعت الإجابة، ارفع الحد حسب الحاجة وقدرة النموذج.',
  'متجر عمل', 'اكتب',
  'اكتب دور الذكاء الاصطناعي ومعلومات النشاط. مثال: «أنت مسؤول متجر Doran. ساعات الخدمة من الاثنين إلى السبت 09:00–17:00 WIB. أجب باختصار ولطف. أحل العميل إلى المسؤول للأسعار أو المخزون غير المعروف».',
  'مال سعر دفع', 'عيد ميلاد كعكة', 'لأحداث الرسائل الواردة', 'لجهة اتصال باسم Budi.', 'لإدراج اسم المستلم و',
  'لإدراج رقم WhatsApp الخاص بالمستلم. مثال:', 'لاسم المستلم أو', 'لرقم WhatsApp الخاص بالمستلم.',
  'مقارنة بالفترة السابقة', 'wa@dorandev.com', 'الأصغر أو المساوي لكل',
  '{{field}} ليس عنوان بريد إلكتروني صالحًا', '{{field}} مطلوب', 'يجب أن يحتوي {{field}} على {{value}} أحرف على الأقل',
  'تم نسخ {{text}} إلى الحافظة', '{{v0}} ({{v1}} أجهزة)', '{{v0}} ({{v1}} جهات اتصال)',
  '{{v0}} فشل · {{v1}} بحاجة إلى فحص', '{{v0}} متصل · {{v1}} غير متصل', '{{v0}} الجهاز {{v1}}؟',
  '{{v0}} {{v1}} - {{v2}}', '{{v0}} · {{v1}}', '· بناءً على تاريخ الإرسال (WIB).', '· حالة الأجهزة الحالية',
  '· WIB', '· لا توجد بيانات مقارنة بالنسبة المئوية بعد', '— أعمدة الرسائل:',
];
if(missingArabic.length){if(missingArabic.length!==arabic.length||missingArabic[0]!=='pastikan key dan ID model sudah diisi, plugin aktif, dan pengaturan berhasil disimpan. Jika enkripsi belum siap, hubungi admin Doran WA.'||missingArabic.at(-1)!=='— kolom pesan:')throw Error('Arabic additions require review: '+missingArabic.length+' / '+arabic.length);missingArabic.forEach((s,i)=>ar[s]=arabic[i]);fs.writeFileSync(arPath,JSON.stringify(ar,null,2));}
const sources=[...new Set([...approved,...JSON.parse(fs.readFileSync(path.join(dir,'translation-source.json'),'utf8')),...Object.keys(overrides)])].sort();
const identities=new Set(['Budi','U','Doran WA','JeBlast','OpenAI Platform','Google AI Studio','Claude Console','English','Indonesia','Español','العربية','हिन्दी','deliveryRate','failureRate','readRate','followGlobal','useGlobalQuota','nama','nomor']);
const legacy={
 'validation.password_not_match':['Konfirmasi kata sandi tidak cocok.','Passwords do not match.','Las contraseñas no coinciden.','كلمتا المرور غير متطابقتين.','पासवर्ड मेल नहीं खाते।'],
 text_messagge:['Pesan teks','Text message','Mensaje de texto','رسالة نصية','टेक्स्ट संदेश'],
 url:['URL','URL','URL','URL','URL'],
 type_request:['Jenis permintaan','Request type','Tipo de solicitud','نوع الطلب','अनुरोध प्रकार'],
 message:['Pesan','Message','Mensaje','الرسالة','संदेश'],
 quote:['Kutipan','Quote','Cita','اقتباس','उद्धरण'],
 response:['Respons','Response','Respuesta','الاستجابة','प्रतिक्रिया'],
 image_in:['Gambar masuk','Incoming image','Imagen recibida','صورة واردة','प्राप्त चित्र'],
 request_type:['Jenis permintaan','Request type','Tipo de solicitud','نوع الطلب','अनुरोध प्रकार'],
 sentAt:['Waktu terkirim','Sent at','Fecha de envío','وقت الإرسال','भेजने का समय'],
 receivedAt:['Waktu diterima','Received at','Fecha de recepción','وقت الاستلام','प्राप्ति का समय'],
 success:['Berhasil','Success','Correcto','نجاح','सफल'],
 failed:['Gagal','Failed','Fallido','فشل','विफल'],
 success_delete:['Berhasil dihapus','Deleted successfully','Eliminado correctamente','تم الحذف بنجاح','हटाया गया'],
 failed_delete:['Gagal menghapus','Could not delete','No se pudo eliminar','تعذر الحذف','हटाया नहीं जा सका'],
 login_success:['Berhasil masuk','Signed in successfully','Sesión iniciada correctamente','تم تسجيل الدخول بنجاح','साइन इन हो गया'],
};
const missing=[];
for(const language of ['id','en','es','ar','hi']){
  const cache=language==='id'?{}:JSON.parse(fs.readFileSync(path.join(dir,language+'-cache.json'),'utf8'));
  const result={};for(const source of sources){const translated=language==='id'||identities.has(source)?source:overrides[source]?.[language]||cache[source];if(!translated)missing.push({language,source});else result[source]=translated;}
  if(!missing.some(m=>m.language===language))fs.writeFileSync(path.join(root,'public/locales',language,'interface.json'),JSON.stringify(result,null,2)+'\n');
}
if(missing.length){fs.writeFileSync(path.join(dir,'missing-local-translations.json'),JSON.stringify(missing,null,2));console.log(missing);process.exitCode=1;}else {
  fs.writeFileSync(path.join(root,'src/data/uiMessagePatterns.json'),JSON.stringify(sources.filter(s=>/\{\{v\d+\}\}/.test(s)),null,2)+'\n');
  for(const namespace of ['common','upgrade']){
    const id=JSON.parse(fs.readFileSync(path.join(root,'public/locales/id',namespace+'.json'),'utf8'));
    function fill(base,target,catalog){for(const [key,value] of Object.entries(base)){if(typeof value==='string'){if(!(key in target))target[key]=catalog[value];}else {target[key]??={};fill(value,target[key],catalog);}}}
    for(const language of ['id','en','es','ar','hi']){const p=path.join(root,'public/locales',language,namespace+'.json'),catalog=JSON.parse(fs.readFileSync(path.join(root,'public/locales',language,'interface.json'),'utf8')),data=JSON.parse(fs.readFileSync(p,'utf8'));fill(id,data,catalog);if(namespace==='common'){data.phone_label=catalog.Label;for(const [key,values]of Object.entries(legacy)){const parts=key.split('.');if(parts.length===2)data[parts[0]][parts[1]]=values[['id','en','es','ar','hi'].indexOf(language)];else data[key]=values[['id','en','es','ar','hi'].indexOf(language)];}}fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');}
  }
  console.log(`Finalized ${sources.length} phrases in all five languages`);
}
