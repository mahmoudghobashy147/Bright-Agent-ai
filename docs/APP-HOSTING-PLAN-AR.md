# خطة نشر Bright Ai عبر Firebase App Hosting

## الحزمة المعدة

التطبيق: bright-ai-cloud — Node.js 24، جذر ZIP `/`، مشروع bright-33420، المنطقة المختارة us-central1، اسم Backend المقترح bright-ai. الاسم لم يُنشأ بعد ولا توجد URL جديدة متحقق منها.

الحدود: cpu=1، memoryMiB=512، concurrency=20، minInstances=0، maxInstances=1. إيقاف الإرسال الفعلي والمدفوعات ومحادثة الجمهور افتراضيًا إلى حين اكتمال الربط واختبار القبول.

الحزمة تحتوي كود الخادم واللوحة وتكوين Firebase Web العام وpackage-lock فقط؛ لا تحتوي مفاتيح خدمة أو ملفات .env أو اختبارات أو ملف Windows أو أي بيانات CRM.

## ما يفعله إعداد App Hosting

خيار Upload a zip في المعالج يشغّل تهيئة بنية المصدر عند الضغط على Next: تفعيل Storage API، إعداد source bucket، ومنح وكيل App Hosting صلاحية قراءة ملفات المصدر. لاحقًا يُبنى المصدر في Cloud Build وينشر Backend على Cloud Run/CDN عبر عنوان HTTPS عام. APIs تتحقق من Firebase ID token وعضوية الشركة؛ قواعد Firestore تمنع الوصول المباشر.

هذه موارد جديدة على Blaze وقد تترتب عليها رسوم استخدام. حد maxInstances لا يمثل سقف فاتورة ماليًا.

## موافقات محددة قبل التنفيذ

- السماح بإنشاء موارد النشر المشار إليها وتفويض وكلاء Google الرسميين ببناء المصدر وتشغيله داخل bright-33420؛ لا يُمنح وصول لمستودعات GitHub أخرى ولا تُنشأ مفاتيح خدمة قابلة للتنزيل.
- الموافقة على نشر نقطة HTTPS عامة للوحة وAPI، مع بقاء العمليات الخاصة محمية بتسجيل الدخول والصلاحيات.
- اختيار واعتماد حساب Firebase Auth المقصود لدور Super Admin. الحساب الموجود راجع من Console؛ لم يرفع عنوانه أو UID الخاص به إلى المستودع العام، ولم تُغيّر صلاحياته بعد.

## اختبارات بعد النشر

1. تطابق projectId وتحقق /health و/console/ ورفض الطلب بلا ID token.
2. ضبط أصل HTTPS الفعلي في CORS وAuth authorized domains عند الحاجة.
3. تسجيل دخول الإدارة والتحقق من حدود صلاحياتها وإنشاء شركة وعضو اختبار فقط.
4. تحقق من حفظ الإعدادات والطلبات في brightAiTenants وفصل شركتين.
5. ربط الأسرار على الخادم واختبار OpenAI ومزوّد الدفع ورقم WhatsApp الاختباري بعد اعتماد النطاق المناسب.
6. لا إعلان عن جاهزية تجارية أو إرسال لعملاء أو دفع حي استنادًا إلى نجاح البناء وحده.

المراجع الرسمية:
- https://firebase.google.com/docs/app-hosting/alt-deploy
- https://firebase.google.com/docs/app-hosting/configure
- https://firebase.google.com/docs/app-hosting/about-app-hosting
