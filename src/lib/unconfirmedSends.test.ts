import { afterAll, afterEach, expect, it, spyOn } from "bun:test";
import { composerDraftKey, composerDrafts } from "./composerDraft.ts";
import { paneLifetimes } from "./paneLifetime.ts";
import { UNCONFIRMED_KEPT_MS, UnconfirmedSends } from "./unconfirmedSends.ts";

const data = new Map<string, string>();
const spies = [
  spyOn(paneLifetimes.paneStorage, "getItem").mockImplementation((key) => data.get(key) ?? null),
  spyOn(paneLifetimes.paneStorage, "setItem").mockImplementation((key, value) => { data.set(key, value); }),
  spyOn(paneLifetimes.paneStorage, "removeItem").mockImplementation((key) => { data.delete(key); }),
];
afterEach(() => { data.clear(); });
afterAll(() => { for (const spy of spies) spy.mockRestore(); });

let pane = 0;
function box(text: string) {
  const key = composerDraftKey(`unconfirmed-${++pane}`);
  composerDrafts.set(key, text);
  return key;
}

it("drops a typed message's text from the box, and what was typed after it stays", () => {
  const sends = new UnconfirmedSends();
  const exact = box("fix the tests");
  const first = sends.begin(exact, "p1", "fix the tests");
  const longer = box("fix the tests\n\nand the docs");
  const second = sends.begin(longer, "p2", "fix the tests");
  let cleared = 0;
  const off = sends.onCleared(exact, () => cleared++);
  sends.settle(exact, [first]);
  sends.settle(longer, [second]);
  expect([composerDrafts.read(exact).text, composerDrafts.read(longer).text]).toEqual(["", "and the docs"]);
  expect([sends.read(exact), sends.read(longer), cleared]).toEqual([[], [], 1]);
  off();
});

it("keeps the box when the bridge did not say it typed it, or the text there changed", () => {
  const sends = new UnconfirmedSends();
  const untold = box("deploy");
  const receipt = sends.begin(untold, "p1", "deploy");
  sends.settle(untold, []);
  expect(composerDrafts.read(untold).text).toBe("deploy");
  expect(sends.read(untold).map((item) => item.receipt)).toEqual([receipt]);
  const edited = box("deploy");
  const typed = sends.begin(edited, "p1", "deploy");
  composerDrafts.set(edited, "do not deploy");
  sends.settle(edited, [typed]);
  expect(composerDrafts.read(edited).text).toBe("do not deploy");
  expect(sends.read(edited)).toEqual([]);
});

it("leaves the box alone while a send from it is on its way", () => {
  const sends = new UnconfirmedSends();
  const key = box("ship it");
  const receipt = sends.begin(key, "p1", "ship it");
  expect(composerDrafts.claim(key, "ship it")).toBe(true);
  sends.settle(key, [receipt]);
  expect(composerDrafts.read(key).text).toBe("ship it");
  composerDrafts.end(key);
  sends.settle(key, [receipt]);
  expect(composerDrafts.read(key).text).toBe("");
});

it("forgets a message once the bridge no longer keeps its receipt", () => {
  let now = 1000;
  const sends = new UnconfirmedSends(undefined, () => now);
  const key = box("old");
  sends.begin(key, "p1", "old");
  now += UNCONFIRMED_KEPT_MS;
  expect(sends.read(key)).toEqual([]);
});
