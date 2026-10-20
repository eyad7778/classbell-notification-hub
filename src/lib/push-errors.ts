export function classifyPushStorageError(error: { code?: string; status?: number; message?: string }) {
  if (error.status === 401 || /unregistered api key|invalid api key|invalid jwt/i.test(error.message ?? "")) {
    return "PUSH_STORAGE_CREDENTIALS_INVALID";
  }
  if (error.code === "42P01" || error.code === "PGRST205") return "PUSH_STORAGE_NOT_READY";
  return "PUSH_STORAGE_FAILED";
}

export function pushErrorMessage(error: unknown, english: boolean) {
  const message = error instanceof Error ? error.message : "PUSH_STORAGE_FAILED";
  switch (message) {
    case "PUSH_STORAGE_CREDENTIALS_INVALID":
      return english
        ? "The notification service key is invalid. The site administrator must update it before connecting this device."
        : "مفتاح خدمة الإشعارات غير صالح. يجب على مسؤول الموقع تحديثه قبل ربط هذا الجهاز.";
    case "PUSH_STORAGE_NOT_READY":
      return english
        ? "Notification storage is not ready. Please contact the site administrator."
        : "حفظ اشتراكات الإشعارات غير مجهّز. تواصل مع مسؤول الموقع.";
    case "PUSH_STORAGE_FAILED":
      return english
        ? "Could not save this device. Please try again."
        : "تعذّر حفظ ربط هذا الجهاز. حاول مرة أخرى.";
    case "PUSH_NOT_CONFIGURED":
      return english
        ? "Device notifications are not configured on the server. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT to the Vercel environment."
        : "إشعارات الجهاز غير مفعّلة على الخادم. يجب ضبط مفاتيح VAPID الثلاثة في إعدادات Vercel.";
    case "PUSH_DEVICE_NOT_CONNECTED":
      return english
        ? "This device is not connected yet. Enable notifications first."
        : "هذا الجهاز غير مربوط بعد. فعّل إشعاراته أولًا.";
    case "PUSH_DELIVERY_FAILED":
      return english
        ? "The server tried to send a test notification but the push service rejected it. Reconnect this device and try again."
        : "حاول الخادم إرسال إشعار تجريبي لكن خدمة الإشعارات رفضته. أعد ربط هذا الجهاز وحاول مرة أخرى.";
    case "PUSH_UNSUPPORTED":
      return english
        ? "This browser does not support push. On iPhone, install the site to the Home Screen and open it from there."
        : "المتصفح لا يدعم إشعارات الجهاز. على iPhone أضف الموقع إلى الشاشة الرئيسية وافتحه من الأيقونة.";
    case "PUSH_PERMISSION_DENIED":
      return english
        ? "Notifications are blocked. Allow them for this site in your browser settings, then try again."
        : "إذن الإشعارات مرفوض. اسمح بها للموقع من إعدادات المتصفح ثم حاول مرة أخرى.";
    default:
      return message;
  }
}
