import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { appFaces } from "./app-faces.ts";
import { buildDemoApp } from "./demo-build.ts";
import { chromePath } from "./chrome-path.ts";
import { serveDemo } from "./demo-server.ts";

const app = mkdtempSync(join(tmpdir(), "ovis-header-context-"));
const evidence = process.env["UI_EVIDENCE_DIR"];
try {
  await buildDemoApp(app);
  const index = join(app, "index.html");
  writeFileSync(index, readFileSync(index, "utf8").replace(/<script type="module"/, '<script src="./demo-transport.js"></script><script type="module"'));
  const server = serveDemo(app, { prefix: "/" });
  try {
    const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
    try {
      if (evidence) mkdirSync(evidence, { recursive: true });
      for (const width of [1440, 390]) for (const theme of ["light", "dark"]) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, isMobile: width === 390, hasTouch: width === 390 });
        try {
          await context.addInitScript(({ width, theme }) => {
            localStorage.setItem("ovis:settings", JSON.stringify({ language: "en", theme }));
            if (width === 1440) sessionStorage.setItem("ovis:split", JSON.stringify({ other: { machineId: "local", paneId: "w1C:p1" }, bSide: "right", active: "a" }));
          }, { width, theme });
          for (const pane of [
            { id: "w1H:p1", title: "Fix the flaky retry test", agent: "Claude Code", workspace: "flaky-retry-test" },
            { id: "w1D:p1", title: "Guard the export button", agent: "Codex", workspace: "export-guard" },
          ]) {
            const page = await context.newPage();
            try {
              const errors: string[] = [];
              page.on("pageerror", (error) => errors.push(error.message));
              await page.goto(`http://127.0.0.1:${server.port}/?pane=${encodeURIComponent(pane.id)}`);
              const title = page.locator(".context-title-text");
              await title.waitFor();
              await appFaces(page);
              const snapshot = await title.ariaSnapshot();
              const full = `${pane.agent} · workstation · ${pane.workspace} · ${pane.title} · /home/demo/.herdr/worktrees/checkout-api/${pane.workspace}`;
              const label = `${width}-${theme}-${pane.workspace}`;
              if (evidence) {
                writeFileSync(join(evidence, `${label}.txt`), snapshot);
                await page.screenshot({ path: join(evidence, `${label}.png`), animations: "disabled" });
              }
              assert.ok(snapshot.includes(`group "${full}"`), `${label}: accessible title names the agent, PC, workspace, title and complete path: ${snapshot}`);
              // a phone's tab row under the header names the tab: the header names the place, its repository on the title's baseline
              const phone = width === 390;
              assert.equal(await title.textContent(), phone ? pane.workspace : pane.title, `${label}: the header's visible title`);
              if (phone) {
                const place = await page.locator(".context").evaluate((context) => {
                  const baseline = (element: Element) => {
                    const probe = document.createElement("span");
                    probe.style.cssText = "display:inline-block;width:0;height:0";
                    element.append(probe);
                    const y = probe.getBoundingClientRect().bottom;
                    probe.remove();
                    return y;
                  };
                  const name = context.querySelector(".context-title-text")!;
                  const sub = context.querySelector(".context-sub:not(.context-session)")!;
                  const header = context.closest(".app-header")!.getBoundingClientRect();
                  return { sub: (sub as HTMLElement).innerText, gap: Math.abs(baseline(name) - baseline(sub.lastElementChild!)), inHeader: sub.getBoundingClientRect().bottom <= header.bottom };
                });
                assert.deepEqual(place, { sub: "checkout-api", gap: 0, inHeader: true }, `${label}: the worktree's repository follows the workspace on its baseline`);
                assert.equal(await page.locator(".context-position").count(), 0, `${label}: the row, not the header, marks the open tab`);
              }
              assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1, "the copy lane's hidden h1 stays the only first-level heading");
              assert.equal(await page.locator("h1.visually-hidden").textContent(), pane.title);
              const mark = phone ? ".context-title .sidebar-mark svg, .context-title .sidebar-mark img" : ".context-title .agent-mark svg";
              await page.locator(mark).first().waitFor();
              const centres = await page.locator("header.app-header").evaluate((header, mark) => {
                const box = header.getBoundingClientRect();
                const style = getComputedStyle(header);
                const line = (box.top + parseFloat(style.paddingTop) + box.bottom - parseFloat(style.borderBottomWidth)) / 2;
                return [...header.querySelectorAll(`${mark}, .header-side .icon-button`)]
                  .filter((element) => element.getClientRects().length > 0)
                  .map((element) => {
                    const drawn = element.getBoundingClientRect();
                    return { control: element.closest(".context-title") ? "title mark" : element.getAttribute("aria-label"), offset: Math.round((drawn.top + drawn.height / 2 - line) * 100) / 100 };
                  });
              }, mark);
              if (width === 1440) assert.ok(centres.some(({ control }) => control === "Hide workspace list"), `${label}: the sidebar's top row is in the header`);
              assert.deepEqual(centres.filter(({ offset }) => Math.abs(offset) > 0.25), [], `${label}: the title's mark and the sidebar's top row are centred on the header's line`);
              assert.deepEqual(errors, []);
              console.log(`PASS ${label}: full accessible context and one unchanged h1; the mark and the sidebar's top row on the header's line${phone ? "; the place, not the tab, titles a phone's header" : ""}`);
            } finally { await page.close(); }
          }
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  } finally { server.stop(); }
} finally { rmSync(app, { recursive: true, force: true }); }
