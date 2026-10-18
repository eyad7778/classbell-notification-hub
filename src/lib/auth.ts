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

export function authErrorAr(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "رقم الهاتف أو كلمة المرور غير صحيحة.";
  if (m.includes("already registered") || m.includes("already exists")) return "هذا الرقم مسجل بالفعل. جرّب تسجيل الدخول.";
  if (m.includes("pwned") || m.includes("weak") || m.includes("compromised")) return "كلمة المرور ضعيفة أو مسرّبة سابقًا، اختر كلمة أقوى.";
  if (m.includes("password")) return "كلمة المرور غير مقبولة. استخدم 8 أحرف على الأقل.";
  if (m.includes("rate")) return "محاولات كثيرة، انتظر قليلًا ثم حاول مجددًا.";
  return "حدث خطأ غير متوقع، حاول مرة أخرى.";
}
