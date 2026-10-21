import { describe, expect, it, vi } from "vitest";
import { createAppQueryClient } from "@/lib/query-client";

describe("Navigation data cache", () => {
  it("reuses fresh results and fetches again after explicit invalidation", async () => {
    const client = createAppQueryClient();
    const queryFn = vi.fn().mockResolvedValue([{ id: "subject-1" }]);
    const options = { queryKey: ["subjects"], queryFn };
    await client.fetchQuery(options);
    await client.fetchQuery(options);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await client.invalidateQueries({ queryKey: ["subjects"] });
    await client.fetchQuery(options);
    expect(queryFn).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it("isolates cached account data between router instances", async () => {
    const first = createAppQueryClient();
    const second = createAppQueryClient();
    first.setQueryData(["me"], { id: "student-1" });
    expect(second.getQueryData(["me"])).toBeUndefined();
    first.clear();
    second.clear();
  });
});