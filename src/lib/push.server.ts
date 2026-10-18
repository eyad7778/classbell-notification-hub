import { createCipheriv, createECDH, createHmac, createPrivateKey, createSign, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type PushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

function b64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function vapidConfig() {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"];
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey() {
  return vapidConfig()?.publicKey ?? null;
}

function encryptPayload(subscription: PushSubscription, payload: string) {
  const uaPublic = decodeBase64Url(subscription.p256dh);
  const authSecret = decodeBase64Url(subscription.auth);
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const authPrk = createHmac("sha256", authSecret).update(sharedSecret).digest();
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    uaPublic,
    asPublic,
  ]);
  const ikm = createHmac("sha256", authPrk)
    .update(Buffer.concat([keyInfo, Buffer.from([1])]))
    .digest();

  const salt = randomBytes(16);
  const cekInfo = Buffer.from("Content-Encoding: aes128gcm\0");
  const nonceInfo = Buffer.from("Content-Encoding: nonce\0");
  const cekPrk = createHmac("sha256", salt).update(ikm).digest();
  const cek = createHmac("sha256", cekPrk).update(Buffer.concat([cekInfo, Buffer.from([1])])).digest().subarray(0, 16);
  const nonce = createHmac("sha256", cekPrk).update(Buffer.concat([nonceInfo, Buffer.from([1])])).digest().subarray(0, 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const recordSize = Buffer.from([0, 0, 16, 0]);
  const keyLength = Buffer.from([asPublic.length]);
  return Buffer.concat([salt, recordSize, keyLength, asPublic, ciphertext]);
}

function createVapidToken(endpoint: string, config: NonNullable<ReturnType<typeof vapidConfig>>) {
  const publicBytes = decodeBase64Url(config.publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error("Invalid VAPID public key");
  const privateBytes = decodeBase64Url(config.privateKey);
  if (privateBytes.length !== 32) throw new Error("Invalid VAPID private key");
  const x = b64url(publicBytes.subarray(1, 33));
  const y = b64url(publicBytes.subarray(33, 65));
  const d = b64url(privateBytes);
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", x, y, d },
    format: "jwk",
  });

  const audience = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: config.subject,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

async function sendOne(subscription: PushSubscription, payload: string) {
  const config = vapidConfig();
  if (!config) throw new Error("Web Push is not configured (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)");

  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== "https:") throw new Error("Push endpoint must use HTTPS");
  const body = encryptPayload(subscription, payload);
  const token = createVapidToken(subscription.endpoint, config);
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${config.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body,
  });
}

export async function deliverPush(
  admin: SupabaseClient<Database>,
  userIds: string[],
  message: { title: string; body: string; url?: string },
) {
  if (!userIds.length) return { sent: 0, failed: 0, configured: !!vapidConfig() };
  if (!vapidConfig()) return { sent: 0, failed: 0, configured: false };

  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error) {
    console.error("Could not load push subscriptions", error);
    return { sent: 0, failed: userIds.length, configured: true };
  }

  let sent = 0;
  let failed = 0;
  await Promise.all((subscriptions ?? []).map(async (subscription: PushSubscription & { id: string }) => {
    try {
      const response = await sendOne(subscription, JSON.stringify({
        title: message.title,
        body: message.body,
        url: message.url ?? "/app/notifications",
        tag: randomUUID(),
      }));
      if (response.status === 404 || response.status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        failed += 1;
      } else if (response.ok) {
        sent += 1;
      } else {
        failed += 1;
        console.error("Web Push endpoint rejected notification", response.status);
      }
    } catch (error) {
      failed += 1;
      console.error("Web Push delivery failed", error);
    }
  }));
  return { sent, failed, configured: true };
}
