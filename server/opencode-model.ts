/**
 * The model, provider and effort of a pane's OpenCode session, read and switched through the OpenCode
 * server its TUI talks to (OpenCode 2): the TUI follows a switch at once, so nothing is typed into the pane.
 */
import type { OpenCodeModelCatalog, OpenCodeModelChoice } from "../shared/protocol.ts";
import { paneProcessRoots } from "./conversation.ts";
import { conflictResponse, jsonResponse } from "./http.ts";
import { opencodeSessionId } from "./opencode.ts";
import { openCodePrivateServer } from "./opencode-private.ts";
import { listOpenCodeModels, openCodeHasSession, openCodeService, openCodeSessionModel, switchOpenCodeModel, verifyOpenCodeService, type OpenCodeServiceConfig } from "./opencode-service.ts";
import { paneContext } from "./pane-context.ts";

interface HeldSession { config: OpenCodeServiceConfig; sessionID: string; cwd: string }

const unavailable = (message: string): Response => jsonResponse({ error: { code: "service_unavailable", message } }, 503);

/**
 * The server the pane's TUI talks to: its own private one when it was started `--standalone`, else the
 * shared service. Only a process that answers /api/info with the pid it was found as is used.
 */
async function paneServer(paneId: string, stateDir: string | undefined, signal?: AbortSignal): Promise<{ config: OpenCodeServiceConfig; version: string } | null> {
  const { pid } = await paneProcessRoots(paneId, "opencode");
  const config = pid !== null && pid > 0 ? openCodePrivateServer(pid) : null;
  if (!config) return openCodeService(stateDir, signal);
  const version = await verifyOpenCodeService(config, signal);
  return version ? { config, version } : null;
}

/** The pane's OpenCode session, only where the verified service holds it; otherwise the answer that says why. */
async function heldSession(paneId: string, stateDir: string | undefined, signal?: AbortSignal): Promise<HeldSession | Response> {
  const context = await paneContext(paneId);
  if (context.agent !== "opencode") return conflictResponse("not_opencode", "The pane does not run OpenCode.");
  const sessionID = opencodeSessionId(context.pane);
  if (!sessionID) return conflictResponse("no_session", "OpenCode has not named its session in this pane yet.");
  const service = await paneServer(paneId, stateDir, signal);
  if (!service || Number(/^(\d+)\./u.exec(service.version)?.[1] ?? 0) < 2) return unavailable("OpenCode's service is not running.");
  if (!await openCodeHasSession(service.config, sessionID, signal)) return conflictResponse("session_not_held", "OpenCode's service does not hold this pane's session.");
  return { config: service.config, sessionID, cwd: context.cwd };
}

async function catalogOf(held: HeldSession, signal?: AbortSignal): Promise<OpenCodeModelCatalog | null> {
  const [listing, current] = await Promise.all([listOpenCodeModels(held.config, held.cwd, signal), openCodeSessionModel(held.config, held.sessionID, signal)]);
  if (!listing) return null;
  const names = new Map(listing.providers.map((provider) => [provider.id, provider.name]));
  const byProvider = new Map<string, OpenCodeModelCatalog["providers"][number]>();
  for (const provider of listing.providers) byProvider.set(provider.id, { id: provider.id, name: provider.name, models: [] });
  for (const model of listing.models) {
    let provider = byProvider.get(model.providerID);
    if (!provider) byProvider.set(model.providerID, provider = { id: model.providerID, name: names.get(model.providerID) ?? model.providerID, models: [] });
    provider.models.push({ id: model.id, name: model.name, variants: model.variants });
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  const providers = [...byProvider.values()].filter((provider) => provider.models.length > 0).sort(byName);
  for (const provider of providers) provider.models.sort(byName);
  return {
    current: current ? { provider: current.providerID, model: current.id, variant: current.variant ?? null } : null,
    providers,
  };
}

/** GET /api/pane/opencode/models */
export async function paneOpenCodeModels(paneId: string, stateDir: string | undefined, signal?: AbortSignal): Promise<Response> {
  const held = await heldSession(paneId, stateDir, signal);
  if (held instanceof Response) return held;
  const catalog = await catalogOf(held, signal);
  return catalog ? jsonResponse(catalog) : unavailable("OpenCode did not list its models.");
}

/** POST /api/pane/opencode/model: only a model, and a variant of it, that the service lists. */
export async function switchPaneOpenCodeModel(paneId: string, choice: OpenCodeModelChoice, stateDir: string | undefined, signal?: AbortSignal): Promise<Response> {
  const held = await heldSession(paneId, stateDir, signal);
  if (held instanceof Response) return held;
  const catalog = await catalogOf(held, signal);
  if (!catalog) return unavailable("OpenCode did not list its models.");
  const model = catalog.providers.find((provider) => provider.id === choice.provider)?.models.find((entry) => entry.id === choice.model);
  if (!model) return conflictResponse("unknown_model", "OpenCode does not offer that model.");
  if (choice.variant !== null && !model.variants.includes(choice.variant)) return conflictResponse("unknown_variant", "That model has no such effort.");
  const result = await switchOpenCodeModel(held.config, held.sessionID, { providerID: choice.provider, id: choice.model, ...(choice.variant === null ? {} : { variant: choice.variant }) }, signal);
  return result.ok ? jsonResponse({ ok: true }) : jsonResponse({ error: { code: "switch_failed", message: `OpenCode refused the switch (HTTP ${result.status}).` } }, 502);
}
