import { createFileRoute } from "@tanstack/react-router";
import { sha256Hex, tg, webhookSecret } from "@/lib/telegram.server";

const ADMIN_PHONE_PROMPT = "📱 ابعت أرقام الطلاب المسجلة في المنصة، كل رقم في سطر أو افصل بينها بفاصلة. استخدم Reply على الرسالة دي.";
const MAX_INVITES_PER_REQUEST = 25;

type TelegramChat = { id: number; type: string; title?: string };
type TelegramMessage = {
  text?: string;
  chat?: TelegramChat;
  from?: { id: number; username?: string };
  reply_to_message?: { text?: string; from?: { id: number } };
};

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function getLinkedStaff(admin: typeof import("@/integrations/supabase/client.server")["supabaseAdmin"], telegramUserId: number) {
  const { data: link, error: linkError } = await admin
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (linkError || !link) return null;
  const { data: role, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", link.user_id)
    .in("role", ["owner", "staff"])
    .limit(1)
    .maybeSingle();
  return roleError || !role ? null : link.user_id;
}

function normalizeEgyptianPhone(raw: string): string | null {
  const westernDigits = raw
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  let digits = westernDigits.replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("20") && digits.length === 13) digits = `0${digits.slice(2)}`;
  return /^01[0125]\d{8}$/.test(digits) ? digits : null;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = await webhookSecret();
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

        const update = (await request.json().catch(() => null)) as { message?: TelegramMessage } | null;
        const msg = update?.message;
        if (!msg?.chat?.id || !msg.from?.id) return Response.json({ ok: true });

        const text = (msg.text ?? "").trim();
        const chatId = msg.chat.id;
        const reply = (message: string, options: Record<string, unknown> = {}) =>
          tg("sendMessage", { chat_id: chatId, text: message, ...options });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (msg.chat.type !== "private") {
          if (/^\/admin(?:@\w+)?$/.test(text)) {
            await reply("لإرسال دعوات الطلاب، ابعت /admin للبوت في محادثة خاصة.");
            return Response.json({ ok: true });
          }
          if (!/^\/setgroup(?:@\w+)?$/.test(text)) return Response.json({ ok: true });
          const staffUserId = await getLinkedStaff(supabaseAdmin, msg.from.id);
          if (!staffUserId) {
            await reply("⛔ الأمر ده متاح لمدير المنصة فقط.");
            return Response.json({ ok: true });
          }
          const bot = await tg<{ id: number }>("getMe");
          if (!bot.ok || !bot.result) {
            await reply("تعذّر التحقق من البوت. راجع إعداد TELEGRAM_API_KEY.");
            return Response.json({ ok: true });
          }
          const [sender, botMember] = await Promise.all([
            tg<{ status: string }>("getChatMember", { chat_id: chatId, user_id: msg.from.id }),
            tg<{ status: string; can_invite_users?: boolean }>("getChatMember", { chat_id: chatId, user_id: bot.result.id }),
          ]);
          if (!sender.ok || !["administrator", "creator"].includes(sender.result?.status ?? "")) {
            await reply("⛔ لازم تكون مشرفًا في الجروب لربطه.");
            return Response.json({ ok: true });
          }
          if (
            !botMember.ok ||
            !["administrator", "creator"].includes(botMember.result?.status ?? "") ||
            (botMember.result?.status !== "creator" && botMember.result?.can_invite_users !== true)
          ) {
            await reply("⚠️ ارفع البوت مشرفًا مع صلاحية دعوة المستخدمين إلى الجروب ثم أعد الأمر.");
            return Response.json({ ok: true });
          }
          const { error } = await supabaseAdmin.from("telegram_group_config").upsert({
            id: 1,
            chat_id: String(chatId),
            chat_title: msg.chat.title ?? null,
            configured_by: staffUserId,
            updated_at: new Date().toISOString(),
          });
          if (error) {
            console.error("Telegram group configuration save failed", { code: error.code, message: error.message });
            await reply("تعذّر حفظ الجروب. تأكد من تطبيق تحديث قاعدة البيانات.");
          } else {
            await reply(`✅ تم ربط جروب ${msg.chat.title ?? "الإشعارات"}. ستصل إليه إعلانات وتنبيهات المنصة.`);
          }
          return Response.json({ ok: true });
        }

        const command = text.match(/^\/(start|admin)(?:@\w+)?(?:\s+([A-Za-z0-9_-]{20,64}))?$/);
        if (command?.[1] === "admin") {
          if (!(await getLinkedStaff(supabaseAdmin, msg.from.id))) {
            await reply("⛔ الأمر ده متاح لمدير المنصة فقط.");
            return Response.json({ ok: true });
          }
          await reply(ADMIN_PHONE_PROMPT, { reply_markup: { force_reply: true, selective: true } });
          return Response.json({ ok: true });
        }

        const isPhoneReply = msg.reply_to_message?.text === ADMIN_PHONE_PROMPT;
        if (isPhoneReply) {
          if (!(await getLinkedStaff(supabaseAdmin, msg.from.id))) {
            await reply("⛔ الأمر ده متاح لمدير المنصة فقط.");
            return Response.json({ ok: true });
          }
          const rawParts = text.split(/[\s,،;؛]+/).filter(Boolean);
          const phones = [...new Set(rawParts.map(normalizeEgyptianPhone).filter((phone): phone is string => !!phone))];
          if (!phones.length) {
            await reply("ما لقيتش أرقام موبايل مصرية صالحة. ابعت الأرقام بصيغة 01xxxxxxxxx.");
            return Response.json({ ok: true });
          }
          if (phones.length > MAX_INVITES_PER_REQUEST) {
            await reply(`ابعت بحد أقصى ${MAX_INVITES_PER_REQUEST} رقم في المرة الواحدة.`);
            return Response.json({ ok: true });
          }

          const { data: group, error: groupError } = await supabaseAdmin
            .from("telegram_group_config")
            .select("chat_id, chat_title")
            .eq("id", 1)
            .maybeSingle();
          if (groupError || !group) {
            await reply("⚠️ اربط الجروب الأول: أضف البوت مشرفًا ثم أرسل /setgroup داخل الجروب.");
            return Response.json({ ok: true });
          }

          const { data: profiles, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("id, phone")
            .in("phone", phones);
          if (profileError) {
            console.error("Telegram invite student lookup failed", { code: profileError.code, message: profileError.message });
            await reply("تعذّر البحث عن الطلاب في المنصة. حاول مرة أخرى.");
            return Response.json({ ok: true });
          }
          const users = profiles ?? [];
          const { data: links, error: linkError } = users.length
            ? await supabaseAdmin.from("telegram_links").select("user_id, chat_id, telegram_user_id, blocked").in("user_id", users.map((user) => user.id))
            : { data: [], error: null };
          if (linkError) {
            console.error("Telegram invite link lookup failed", { code: linkError.code, message: linkError.message });
            await reply("تعذّر تحميل روابط Telegram للطلاب. حاول مرة أخرى.");
            return Response.json({ ok: true });
          }

          const linkByUser = new Map((links ?? []).map((link) => [link.user_id, link]));
          let invited = 0;
          let alreadyInGroup = 0;
          let notLinked = 0;
          let failed = 0;
          for (const user of users) {
            const studentLink = linkByUser.get(user.id);
            if (!studentLink || studentLink.blocked) {
              notLinked += 1;
              continue;
            }
            try {
              const member = await tg<{ status: string; is_member?: boolean }>("getChatMember", {
                chat_id: group.chat_id,
                user_id: studentLink.telegram_user_id,
              });
              if (member.ok && (["creator", "administrator", "member"].includes(member.result?.status ?? "") || member.result?.is_member)) {
                alreadyInGroup += 1;
                continue;
              }
              const invite = await tg<{ invite_link: string }>("createChatInviteLink", {
                chat_id: group.chat_id,
                name: "Student invite",
                expire_date: Math.floor(Date.now() / 1000) + 48 * 60 * 60,
                member_limit: 1,
              });
              if (!invite.ok || !invite.result?.invite_link) {
                failed += 1;
                continue;
              }
              const sent = await tg("sendMessage", {
                chat_id: studentLink.chat_id,
                text: `👋 أهلًا بك! تم تجهيز دعوة خاصة للانضمام إلى جروب ${group.chat_title ?? "الطلاب"}.\n\n${invite.result.invite_link}\n\nالرابط صالح لمدة 48 ساعة ويُستخدم مرة واحدة.`,
                disable_web_page_preview: true,
              });
              if (sent.ok) invited += 1;
              else failed += 1;
            } catch (error) {
              failed += 1;
              console.error("Could not invite linked student to Telegram group", error);
            }
          }
          const notFound = phones.length - users.length;
          await reply(
            `📨 خلصت مراجعة الأرقام:\n✅ أرسلت دعوات: ${invited}\n👥 موجودون بالفعل: ${alreadyInGroup}\n🔗 يحتاجون ربط Telegram من التطبيق: ${notLinked}\n❓ أرقام غير مسجلة: ${notFound}\n⚠️ تعذّر إرسال دعوة: ${failed}`,
          );
          return Response.json({ ok: true });
        }

        const commandStart = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{20,64}))?$/);
        if (!commandStart) {
          await reply("مرحبًا 👋 هذا بوت إشعارات Smart Student. لربط حسابك افتح صفحة «ربط Telegram» داخل التطبيق واضغط زر الربط.");
          return Response.json({ ok: true });
        }
        if (!commandStart[1]) {
          await reply("لإتمام الربط يجب فتح البوت من زر «ربط حساب Telegram» داخل التطبيق، فالضغط على Start وحده لا يكفي.");
          return Response.json({ ok: true });
        }

        const hash = await sha256Hex(commandStart[1]);
        const { data: tok, error: tokenError } = await supabaseAdmin
          .from("telegram_link_tokens")
          .update({ used_at: new Date().toISOString() })
          .eq("token_hash", hash)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .select("user_id")
          .maybeSingle();
        if (tokenError) {
          console.error("Telegram token lookup failed", { code: tokenError.code, message: tokenError.message });
          return Response.json({ error: "Telegram link storage unavailable" }, { status: 503 });
        }
        if (!tok) {
          await reply("رمز الربط غير صالح أو منتهي أو مستخدم من قبل. ارجع للتطبيق واضغط «ربط حساب Telegram» مرة أخرى.");
          return Response.json({ ok: true });
        }

        const { data: other } = await supabaseAdmin.from("telegram_links").select("user_id").eq("telegram_user_id", msg.from.id).maybeSingle();
        if (other && other.user_id !== tok.user_id) {
          await reply("حساب Telegram هذا مرتبط بحساب طالب آخر. تواصل مع الدعم إذا كان هذا خطأ.");
          return Response.json({ ok: true });
        }

        const { error } = await supabaseAdmin.from("telegram_links").upsert({
          user_id: tok.user_id,
          telegram_user_id: msg.from.id,
          chat_id: msg.chat.id,
          telegram_username: msg.from.username ?? null,
          linked_at: new Date().toISOString(),
          blocked: false,
        });
        if (error) {
          console.error("Telegram account link failed", { code: error.code, message: error.message });
          await reply("حدث خطأ أثناء الربط، حاول مرة أخرى بعد قليل.");
          return Response.json({ ok: true });
        }
        await reply("✅ تم ربط حسابك بنجاح! ستصلك إشعارات Smart Student هنا. يمكنك العودة للتطبيق الآن.");
        return Response.json({ ok: true });
      },
    },
  },
});
