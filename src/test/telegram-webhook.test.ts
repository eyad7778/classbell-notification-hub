import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn(), tg: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/lib/telegram.server", () => ({
  webhookSecret: async () => "test-secret",
  sha256Hex: async () => "hashed-token",
  tg: mocks.tg,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => {
    const query = {
      update: () => query, eq: () => query, is: () => query,
      gt: () => query, select: () => query, maybeSingle: mocks.maybeSingle,
    };
    return query;
  } },
}));
import { Route } from "@/routes/api/public/telegram/webhook";

const handler = (Route as unknown as {
  server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
}).server.handlers.POST;

function request(secret = "test-secret") {
  return new Request("https://example.test/api/public/telegram/webhook", {
    method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": secret, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { text: `/start ${"a".repeat(48)}`, chat: { id: 1, type: "private" }, from: { id: 2 } } }),
  });
}

describe("Telegram token failures", () => {
  beforeEach(() => vi.resetAllMocks());
  it("returns a retryable failure for storage errors instead of rejecting the token", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "401", message: "Invalid credential" } });
    expect((await handler({ request: request() })).status).toBe(503);
    expect(mocks.tg).not.toHaveBeenCalled();
  });
  it("rejects an actually missing, expired, or consumed token", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await handler({ request: request() })).status).toBe(200);
    expect(mocks.tg).toHaveBeenCalledOnce();
  });
  it("does not access token storage without the webhook secret", async () => {
    expect((await handler({ request: request("wrong") })).status).toBe(401);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });
});