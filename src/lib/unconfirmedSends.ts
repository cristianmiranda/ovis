import { RECEIPT_RESUME_ID } from "../../shared/receipt-resume.ts";
import { composerDrafts } from "./composerDraft.ts";
import { paneLifetimes } from "./paneLifetime.ts";
import { randomUuid } from "./receiptResume.ts";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
interface Unconfirmed { receipt: string; pane_id: string; sent: string; at: number }

const PREFIX = "ovis:composer-receipts:";
/** as long as the bridge keeps a typed receipt (server/core/pending.ts) */
export const UNCONFIRMED_KEPT_MS = 30 * 60 * 1000;

/**
 * Immediate composer messages this page got no submit-result for (the connection dropped, it timed out, or the page
 * was frozen or closed while it waited), each with the receipt it carried. A later connection asks the bridge which
 * it typed (HerdrSocket.typedReceipts), and the box then drops that sent text. Nothing is ever sent from here.
 */
export class UnconfirmedSends {
  private listeners = new Map<string, Set<() => void>>();
  constructor(private storage: () => Storage = () => paneLifetimes.paneStorage, private now: () => number = Date.now) {}

  read(draftKey: string): Unconfirmed[] {
    let raw: string | null = null;
    try { raw = this.storage().getItem(PREFIX + draftKey); } catch { return []; }
    if (!raw) return [];
    try {
      const list: unknown = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list.filter((item): item is Unconfirmed => typeof item === "object" && item !== null
        && typeof item.receipt === "string" && RECEIPT_RESUME_ID.test(item.receipt) && typeof item.pane_id === "string"
        && typeof item.sent === "string" && item.sent !== "" && typeof item.at === "number" && this.now() - item.at < UNCONFIRMED_KEPT_MS);
    } catch { return []; }
  }

  private write(draftKey: string, list: readonly Unconfirmed[]): void {
    try {
      if (list.length === 0) this.storage().removeItem(PREFIX + draftKey);
      else this.storage().setItem(PREFIX + draftKey, JSON.stringify(list.slice(-32)));
    } catch {}
  }

  /** kept before the message leaves, so a page closed while it waits still has it; the receipt to send with it */
  begin(draftKey: string, paneId: string, sent: string): string {
    const receipt = randomUuid();
    this.write(draftKey, [...this.read(draftKey), { receipt, pane_id: paneId, sent, at: this.now() }]);
    return receipt;
  }

  end(draftKey: string, receipt: string): void {
    this.write(draftKey, this.read(draftKey).filter((item) => item.receipt !== receipt));
  }

  /** The bridge typed these: each one's text leaves the box where the box still starts with it, never while a send is on its way. */
  settle(draftKey: string, typed: readonly string[]): void {
    composerDrafts.refresh(draftKey);
    if (composerDrafts.read(draftKey).sending) return;
    const list = this.read(draftKey);
    let cleared = false;
    for (const item of list) {
      if (!typed.includes(item.receipt)) continue;
      const current = composerDrafts.read(draftKey).text;
      if (!current.startsWith(item.sent)) continue;
      composerDrafts.set(draftKey, current.slice(item.sent.length).replace(/^\s+/u, ""));
      cleared = true;
    }
    this.write(draftKey, list.filter((item) => !typed.includes(item.receipt)));
    if (cleared) for (const listener of this.listeners.get(draftKey) ?? []) listener();
  }

  /** `listener` runs when a settle cleared sent text from this box */
  onCleared(draftKey: string, listener: () => void): () => void {
    const set = this.listeners.get(draftKey) ?? new Set();
    set.add(listener);
    this.listeners.set(draftKey, set);
    return () => { set.delete(listener); if (set.size === 0) this.listeners.delete(draftKey); };
  }
}

export const unconfirmedSends = new UnconfirmedSends();
