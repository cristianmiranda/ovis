import { afterEach, expect, it, mock, spyOn } from "bun:test";
import * as herdr from "../herdr/client.ts";
import * as processStart from "../process-start.ts";
import { connectionData } from "./connections.ts";
import { createPendingDelivery } from "./pending.ts";

afterEach(() => mock.restore());

type Frame = { type: string; [key: string]: unknown };
const RECEIPT = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const OTHER = "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";

function delivery(fails = false) {
  const submitted: string[] = [];
  spyOn(herdr, "paneProcessInfo").mockResolvedValue({ pane_id: "p", shell_pid: 41000, foreground_processes: [{ pid: 41001, name: "codex", argv: ["codex"] }] } as Awaited<ReturnType<typeof herdr.paneProcessInfo>>);
  spyOn(processStart, "processStartedAtAsync").mockResolvedValue(1000);
  spyOn(herdr, "paneRead").mockResolvedValue({ text: "› Ask Codex to do anything\n" } as Awaited<ReturnType<typeof herdr.paneRead>>);
  const connection = (deviceId: string | undefined) => {
    const frames: Frame[] = [];
    const client = { data: connectionData({ deviceId, readOnly: false }), getBufferedAmount: () => 0, send: (value: string) => { frames.push(JSON.parse(value) as Frame); return 1; } };
    client.data.attached.set("p", { keepSize: false });
    return { client, frames };
  };
  const phone = connection("phone"), again = connection("phone"), laptop = connection("laptop");
  const pane = { pane_id: "p", terminal_id: "p", workspace_id: "w", tab_id: "t", agent: "codex", agent_status: "idle", focused: false, revision: 0 };
  const facts = { attached: true, origin: true, sameAttachment: true, samePty: true, sameClaim: true, claimed: true, member: true, ready: true, held: false, currentHeld: false, mirror: false, cols: 80 };
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T,>(_pane: string, run: () => T | Promise<T>): Promise<T> => { const next = tail.catch(() => {}).then(run); tail = next; return next; };
  const pending = createPendingDelivery({
    options: { submitDelayMs: 0 }, clients: new Set([phone.client, again.client, laptop.client]), attachments: new Map(), sight: (() => ({ facts: () => facts, write: () => {} })), serialize,
    lastTyped: new Map(), authorizeSocket: () => {},
    submitText: async (_pane: string, text: string) => { if (fails) throw new herdr.HerdrError("input_draft", "the box holds typed text"); submitted.push(text); },
    clientSnapshot: async () => ({ panes: [pane] }), omo: { sessionOf: () => null }, SUBMIT_DEADLINE_MS: 1000, SUBMIT_DELAY_MS: 0, TYPED_SETTLE_MS: 0,
  } as unknown as Parameters<typeof createPendingDelivery>[0]);
  const submit = (id: number, extra: Record<string, unknown>) => pending.pendingFrames.submit(phone.client as never,
    { type: "submit", id, pane_id: "p", text: "hello", payload: "hello", ...extra } as never);
  const ask = (who: { client: unknown; frames: Frame[] }, receipts: { pane_id: string; receipt: string }[]) => {
    pending.pendingFrames["submit-receipts"](who.client as never, { type: "submit-receipts", id: 9, receipts } as never);
    return who.frames.filter((frame) => frame.type === "submit-receipts-result" && frame.id === 9).at(-1)?.typed;
  };
  return { submitted, submit, ask, phone, again, laptop };
}

it("tells a later connection of the same device that a message with its receipt was typed, and no other device", async () => {
  const d = delivery();
  await d.submit(1, { receipt: RECEIPT });
  expect(d.submitted).toEqual(["hello"]);
  expect(d.phone.frames.find((frame) => frame.type === "submit-result")).toMatchObject({ ok: true });
  expect(d.ask(d.again, [{ pane_id: "p", receipt: RECEIPT }, { pane_id: "p", receipt: OTHER }])).toEqual([RECEIPT]);
  expect(d.ask(d.laptop, [{ pane_id: "p", receipt: RECEIPT }])).toEqual([]);
  expect(d.ask(d.again, [{ pane_id: "q", receipt: RECEIPT }])).toEqual([]);
});

it("keeps no receipt for a message it did not type", async () => {
  const d = delivery(true);
  await d.submit(1, { receipt: RECEIPT });
  expect(d.phone.frames.find((frame) => frame.type === "submit-result")).toMatchObject({ ok: false });
  expect(d.ask(d.again, [{ pane_id: "p", receipt: RECEIPT }])).toEqual([]);
});

it("refuses a receipt that is not a UUID, or on a queued message, typing nothing", async () => {
  for (const extra of [{ receipt: "not-a-uuid" }, { receipt: RECEIPT, delivery: "queue" }]) {
    const d = delivery();
    await d.submit(1, extra);
    expect(d.phone.frames.find((frame) => frame.type === "submit-result")).toMatchObject({ ok: false, code: "invalid_delivery" });
    expect(d.submitted).toEqual([]);
  }
});
