import { describe, expect, it } from "bun:test";

import type { OpenCodeModelCatalog } from "../../shared/protocol.ts";
import { initialChoice, sameChoice, withModel, withProvider } from "./openCodeModel.ts";

const catalog: OpenCodeModelCatalog = {
  current: { provider: "claude-agent", model: "opus", variant: "high" },
  providers: [
    { id: "claude-agent", name: "Claude Agent", models: [{ id: "opus", name: "Opus 5.5", variants: ["low", "high"] }, { id: "sonnet", name: "Sonnet 5.5", variants: ["low"] }] },
    { id: "github-copilot", name: "GitHub Copilot", models: [{ id: "gpt-6", name: "GPT-6", variants: ["high"] }, { id: "opus", name: "Claude Opus", variants: [] }] },
  ],
};

describe("the OpenCode model switch's choice", () => {
  it("starts on the session's model, or on the first one listed when the service names none", () => {
    expect(initialChoice(catalog)).toEqual({ provider: "claude-agent", model: "opus", variant: "high" });
    expect(initialChoice({ ...catalog, current: null })).toEqual({ provider: "claude-agent", model: "opus", variant: null });
    expect(initialChoice({ current: null, providers: [] })).toBeNull();
  });

  it("keeps the model across providers where the next one offers it, and a variant only where the model has it", () => {
    const start = initialChoice(catalog)!;
    expect(withProvider(catalog, start, "github-copilot")).toEqual({ provider: "github-copilot", model: "opus", variant: null });
    expect(withProvider(catalog, { provider: "claude-agent", model: "sonnet", variant: "low" }, "github-copilot")).toEqual({ provider: "github-copilot", model: "gpt-6", variant: null });
    expect(withProvider(catalog, { provider: "github-copilot", model: "gpt-6", variant: "high" }, "claude-agent")).toEqual({ provider: "claude-agent", model: "opus", variant: "high" });
    expect(withModel(catalog, start, "sonnet")).toEqual({ provider: "claude-agent", model: "sonnet", variant: null });
    expect(withModel(catalog, { ...start, variant: "low" }, "sonnet")).toEqual({ provider: "claude-agent", model: "sonnet", variant: "low" });
    expect(withModel(catalog, start, "missing")).toBe(start);
  });

  it("is unchanged only when provider, model and variant all match", () => {
    expect(sameChoice(catalog.current, { provider: "claude-agent", model: "opus", variant: "high" })).toBe(true);
    expect(sameChoice(catalog.current, { provider: "claude-agent", model: "opus", variant: null })).toBe(false);
    expect(sameChoice(null, catalog.current)).toBe(false);
  });
});
