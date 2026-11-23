import { describe, expect, it } from "bun:test";

import type { PaneInfo } from "../../shared/protocol.ts";
import { alertPaneTitle, displayPaneTitle, tabPaneTitle } from "./Sidebar.tsx";

// a herdr-core shell whose program set no title: hc reports it as "", beside the folder it runs in (#3231)
const untitled = (extra: Partial<PaneInfo> = {}): PaneInfo => ({
  pane_id: "t1", terminal_id: "t1", workspace_id: "w", tab_id: "w:t", revision: 0, focused: false, agent_status: "idle",
  cwd: "/home/u/projects/api", foreground_cwd: "/home/u/projects/api", title: "", terminal_title: "", ...extra,
});

describe("a pane whose terminal title is empty", () => {
  it("is named by its folder in the header, the browser tab and an alert, never by its id", () => {
    expect(displayPaneTitle(untitled())).toBe("api");
    expect(tabPaneTitle(untitled())).toBe("api");
    expect(alertPaneTitle(untitled())).toBe("api");
  });

  it("takes a title of blanks for none", () => {
    expect(displayPaneTitle(untitled({ terminal_title: "  ", terminal_title_stripped: " " }))).toBe("api");
  });

  it("still shows a title the program set", () => {
    expect(displayPaneTitle(untitled({ terminal_title: "vim notes.md" }))).toBe("vim notes.md");
  });
});

describe("a shell's user@host:path title", () => {
  it("is named by the path's last folder in the header, the browser tab and an alert, with or without a user", () => {
    for (const title of ["me@beast:/home/me/.cache/ovis-tmp/mobile-qa", "@beast:/home/me/.cache/ovis-tmp/mobile-qa", "me@beast: ~/.cache/ovis-tmp/mobile-qa"]) {
      const pane = untitled({ terminal_title: title, terminal_title_stripped: title });
      expect(displayPaneTitle(pane)).toBe("mobile-qa");
      expect(tabPaneTitle(pane)).toBe("mobile-qa");
      expect(alertPaneTitle(pane)).toBe("mobile-qa");
    }
  });
});
