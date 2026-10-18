// Phone-based login: derive a deterministic internal email from the phone number.
export function normalizePhone(raw: string): string {
  const ar = "٠١٢٣٤٥٦٧٨٩";
  const latin = raw.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
  let digits = latin.replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(4);
  else if (digits.startsWith("20") && digits.length === 12) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("1")) digits = "0" + digits;
  return digits;
}

export function isValidEgyptPhone(phone: string): boolean {
  return /^01[0125]\d{8}$/.test(phone);
}

export function phoneToEmail(phone: string): string {
  return `${phone}@students.smartcampus.app`;
}

export function authErrorAr(message: string, code?: string): string {
  const m = message.toLowerCase();
  if (code === "over_email_send_rate_limit" || m.includes("email rate limit")) return "تعذّر إنشاء الحساب بسبب حدّ رسائل تأكيد البريد. تواصل مع الإدارة لضبط التسجيل برقم الهاتف دون تأكيد بريد إلكتروني.";
  if (code === "email_not_confirmed") return "الحساب ينتظر تأكيد البريد، لكن التسجيل هنا برقم الهاتف. تواصل مع الإدارة لتصحيح إعداد تأكيد الحساب.";
  if (code === "email_provider_disabled" || code === "signup_disabled") return "إنشاء الحسابات غير متاح حاليًا. تواصل مع الإدارة لتفعيل التسجيل.";
  if (code === "unexpected_failure" || m.includes("database error saving new user")) return "تعذّر حفظ الحساب في النظام. تواصل مع الإدارة لمراجعة إعدادات إنشاء حساب الطالب، ثم حاول مرة أخرى.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) return "تعذّر الاتصال بالخدمة. تحقق من الإنترنت ثم حاول مرة أخرى.";
  if (m.includes("invalid login")) return "رقم الهاتف أو كلمة المرور غير صحيحة.";
  if (m.includes("already registered") || m.includes("already exists")) return "هذا الرقم مسجل بالفعل. جرّب تسجيل الدخول.";
  if (m.includes("pwned") || m.includes("weak") || m.includes("compromised")) return "كلمة المرور ضعيفة أو مسرّبة سابقًا، اختر كلمة أقوى.";
  if (m.includes("password")) return "كلمة المرور غير مقبولة. استخدم 8 أحرف على الأقل.";
  if (m.includes("rate")) return "محاولات كثيرة، انتظر قليلًا ثم حاول مجددًا.";
  return "حدث خطأ غير متوقع، حاول مرة أخرى.";
}
