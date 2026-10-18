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
    default:
      return message;
  }
}