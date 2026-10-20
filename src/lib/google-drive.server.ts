import { createSign } from "node:crypto";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function credentials(): { account: ServiceAccount; folderId: string } {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!raw || !folderId) {
    throw new Error("Google Drive is not configured on the server (GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_FOLDER_ID)");
  }
  let account: ServiceAccount;
  try {
    account = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON must contain the service account JSON");
  }
  if (!account.client_email || !account.private_key) throw new Error("Google Drive service account JSON is missing client_email or private_key");
  return { account, folderId };
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: account.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(account.private_key.replace(/\\n/g, "\n")).toString("base64url")}`;
  const response = await fetch(account.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const payload = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    console.error("Google Drive token request failed", { status: response.status, reason: payload.error_description });
    throw new Error("تعذر اتصال الخادم بحساب Google Drive. راجع بيانات الخدمة وصلاحياتها.");
  }
  return payload.access_token;
}

export async function uploadToGoogleDrive(input: { name: string; mimeType: string; contentBase64: string }) {
  const { account, folderId } = credentials();
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(input.mimeType)) throw new Error("نوع الملف غير صالح.");
  const content = Buffer.from(input.contentBase64, "base64");
  if (!content.length || content.length > 2.5 * 1024 * 1024) throw new Error("حجم الملف يجب ألا يتجاوز 2.5 ميغابايت.");
  const token = await accessToken(account);
  const boundary = `smart-student-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: input.name, mimeType: input.mimeType || "application/octet-stream", parents: [folderId] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${input.mimeType || "application/octet-stream"}\r\n\r\n`,
    Uint8Array.from(content),
    `\r\n--${boundary}--`,
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const payload = await response.json() as { id?: string; name?: string; webViewLink?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) {
    console.error("Google Drive upload failed", { status: response.status, reason: payload.error?.message });
    throw new Error("فشل رفع الملف إلى Google Drive. تحقق من مشاركة مجلد Drive مع حساب الخدمة.");
  }
  return { id: payload.id, name: payload.name ?? input.name, url: payload.webViewLink ?? `https://drive.google.com/file/d/${payload.id}/view` };
}
