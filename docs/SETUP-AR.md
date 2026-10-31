# تشغيل Bright Ai V26

## متطلبات خارج الكود

- حساب Firebase مع وصول مصرح إلى bright-33420، Authentication email/password، هوية خادم لها أقل صلاحيات لازمة إلى Firestore وقراءة حسابات Auth والتحقق من إلغاء الجلسات.
- خادم HTTPS وقيمة BRIGHT_PUBLIC_URL، وضبط نطاقات Authentication المسموحة.
- مفتاح OpenAI على الخادم فقط مع سقف إنفاق في حساب المزوّد.
- تطبيق Meta ورقم اختبار وApp Secret وVerify Token ورمز وصول ورقم Phone Number ID. التطبيق يستخدم Meta Cloud API؛ الرسوم والشروط يحددها المزوّد، ولا يعد بتكامل مجاني غير محدود.
- حساب Paymob بمفاتيح sandbox وIntegration ID مطابق. اختيار Paymob هنا اقتراح تنفيذي لمصر يحتاج اعتماد التاجر؛ الدفع الحي والخصم الدوري غير منفذين.

## تشغيل الخادم

1. تثبيت Node 24 LTS ثم `npm install --prefix cloud`.
2. نسخ cloud/.env.example إلى ملف أسرار خارج Git وضبط القيم. على الخادم استخدم ADC أو Workload Identity بدل مفاتيح طويلة العمر إن أمكن.
3. من مجلد cloud تشغيل `node --env-file=.env service.js` بعد إعداد ملف .env محليًا. لا يتم تحميل .env تلقائيًا عبر npm start.
4. افتح `/console/` على خادم HTTPS. إعداد Web Firebase المرفق ليس مفتاح خدمة، ويجب مراجعته مع المشروع الفعلي قبل اختبار الدخول.
5. إنشاء حساب الإدارة عبر Firebase Auth ثم إضافة Custom Claim `brightSuperAdmin: true` بواسطة مسؤول موثوق. لا توجد كلمة مرور افتراضية أو ترقية ذاتية من المتصفح.
6. إنشاء حساب مالك الشركة في Auth، ثم إنشاء الشركة من Super Admin. تبدأ معلقة. تحديد تجربة مؤرخة من الإدارة لاختبارها. صاحب الشركة يضيف أعضاء Auth الموجودين ويختار الصلاحية أو يوقف الوصول.
7. ربط Phone Number ID بالشركة من Super Admin. إعداد webhook `/webhooks/whatsapp` والتحقق من التوقيع. الإرسال يظل مقفولًا حتى موافقة المستخدم واختبار رقم مسموح وتغيير BRIGHT_ALLOW_CUSTOMER_SENDS على الخادم.
8. ربط `/webhooks/paymob` للإشعارات التجريبية بعد ضبط sandbox. الطلب المكرر بنفس requestId لا ينشئ checkout آخر؛ حالات needs_reconciliation تحتاج فحص لوحة المزوّد. لا تعتمد إعادة توجيه المتصفح لتأكيد الدفع.

## دمج مساعد الموقع

ضع `<script src="https://YOUR_SERVER/widget.js" data-widget-id="WIDGET_ID" defer></script>` على موقع الشركة، وأضف أصل الموقع إلى BRIGHT_ALLOWED_ORIGINS. widgetId معرّف عام لا كلمة سر. يجب إضافة حماية إساءة استخدام موزعة/App Check وسياسات خصوصية قبل طرح widget على مواقع عامة كثيفة الزيارات. حد المعدل الحالي داخل ذاكرة نسخة الخادم، وحد الباقة في معاملة Firestore مشتركة.

## Windows

من desktop: `npm install` ثم `npm run dist:win -- --publish never` على Windows. الناتج `desktop/dist/Bright-Ai-Setup.exe`. يبدأ البرنامج بشاشة إدخال رابط HTTPS، ثم تفتح لوحة الشركة. لا تضع مفاتيح OpenAI أو Admin داخله. الملف يحتاج توقيع Authenticode قبل التوزيع التجاري؛ البناء غير الموقع مرشح اختبار فقط.

GitHub Actions يبني الملف بعد الاختبارات وفحص التبعيات، ويثبت النسخة فعليًا على Windows runner ويختبر شاشة الإعداد. هذا لا يغني عن اختبار جهاز مستخدم حقيقي ولا عن الربط الحقيقي.

## قواعد Firebase

تم حذف مجموعتي CRM بموافقة صريحة بدون نسخة، ثم نشر `firebase/bright-ai-server-only.rules` بعد موافقة المستخدم على منع العملاء المباشرين. البيانات تمر عبر API مع عضوية الشركات، وAdmin SDK يحتاج هوية خادم مصرحًا بها عبر IAM.

## Firebase App Hosting

- حزمة المصدر تُجهز بواسطة `python3 scripts/package-apphosting.py /absolute/path/source.zip`، ثم يُرفع ZIP في Firebase Console. اختر جذر التطبيق `/`.
- `cloud/apphosting.yaml` يحدد Node server وminInstances=0 وmaxInstances=1. السقف نسخة تشغيل واحدة لا يضمن حدًا ماليًا ثابتًا؛ Cloud Build/Storage/Run قد تترتب عليها رسوم حسب الاستخدام على Blaze.
- إنشاء مصدر ZIP لأول مرة يفعّل Storage API وينشئ source bucket ويمنح App Hosting Service Agent صلاحية قراءة المصدر. لم يُنفذ هذا الإعداد قبل موافقة محددة على موارد النشر والصلاحيات.
- يلزم ضبط BRIGHT_ALLOWED_ORIGINS وBRIGHT_PUBLIC_URL على أصل HTTPS الفعلي الذي يعرضه Backend بعد إنشائه؛ قيمة YAML الأولية تسمح فقط بأصل Firebase Hosting الحالي.
- يمكن اعتماد Super Admin عبر Firebase custom claim أو allowlist خادمية `BRIGHT_SUPER_ADMIN_UIDS`. القائمة فارغة افتراضيًا ولا تُملأ بحساب حقيقي قبل موافقة على الحساب المعني. امتلاك حساب Google للمشروع لا يجعله حساب Firebase Auth تلقائيًا.
- مفاتيح OpenAI وMeta وPaymob تضاف عبر Secret Manager على الخادم؛ لا تضاف للحزمة أو GitHub أو المتصفح.
- راجع docs/APP-HOSTING-PLAN-AR.md قبل استكمال المعالج. لا يُنشأ أي خصم دوري ولا تُرسل رسالة عميل من إعداد النشر هذا.
