export const STAFF_PERMISSIONS = [
  { id: "students", label: "إدارة الطلاب والحسابات" },
  { id: "payments", label: "مراجعة المدفوعات والاشتراكات" },
  { id: "content", label: "إدارة المواد والمحتوى" },
  { id: "communications", label: "الإعلانات والإشعارات" },
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number]["id"];

export const STUDY_LEVELS = [
  "الفرقة الأولى",
  "الفرقة الثانية",
  "الفرقة الثالثة",
  "الفرقة الرابعة",
] as const;

export type StudyLevel = (typeof STUDY_LEVELS)[number];
