import { folderName } from "./paneName.ts";

export interface HeaderCrumb {
  machine: string;
  showMachine: boolean;
  workspace: string;
  folder: string | null;
  /** what the line under the title shows, in order: none of it repeats the title */
  line: { key: "machine" | "workspace" | "folder"; text: string }[];
  place: string;
  path: string | null;
  fullContext: string;
  tooltip: string;
}

export function headerCrumb(input: { machine: string; machineCount: number; workspace: string; title: string; cwd: string | null | undefined }): HeaderCrumb {
  const machine = input.machine.trim();
  const workspace = input.workspace.trim();
  const title = input.title.trim();
  // trimmed only to tell an absent folder: a name may end in a space, and is shown as it is
  const path = input.cwd?.trim() ? input.cwd : null;
  const name = path === null ? null : folderName(path);
  const showMachine = input.machineCount > 1;
  const said = name === null || [title, showMachine ? machine : null, workspace].includes(name);
  const folder = said ? null : name;
  const fullContext = [machine, workspace, title !== workspace ? title : null, path].filter((part): part is string => part !== null && part !== "").join(" · ");
  const line: HeaderCrumb["line"] = [];
  if (showMachine) line.push({ key: "machine", text: machine });
  if (workspace !== title) line.push({ key: "workspace", text: workspace });
  if (folder !== null) line.push({ key: "folder", text: folder });
  return {
    machine,
    showMachine,
    workspace,
    folder,
    line,
    place: `${machine} › ${workspace}`,
    path,
    fullContext,
    tooltip: fullContext,
  };
}

export function showsChat(pane: { restore_error?: unknown } | null | undefined, view: string): boolean {
  return !!pane && !pane.restore_error && view === "chat";
}
