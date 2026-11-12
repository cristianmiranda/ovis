import type { OpenCodeModelCatalog, OpenCodeModelChoice } from "../../shared/protocol.ts";

type Model = OpenCodeModelCatalog["providers"][number]["models"][number];

/** The variant kept across a change of model: the same one where the next model has it, else the model's default. */
const keptVariant = (variant: string | null, model: Model): string | null => variant !== null && model.variants.includes(variant) ? variant : null;

/** What the dialog starts on: the session's own model, or the first one listed when the service names none. */
export function initialChoice(catalog: OpenCodeModelCatalog): OpenCodeModelChoice | null {
  if (catalog.current) return catalog.current;
  const provider = catalog.providers.find((entry) => entry.models.length > 0);
  return provider ? { provider: provider.id, model: provider.models[0]!.id, variant: null } : null;
}

/** Another provider: the same model where it offers it too (Claude through Copilot), else its first. */
export function withProvider(catalog: OpenCodeModelCatalog, choice: OpenCodeModelChoice, provider: string): OpenCodeModelChoice {
  const models = catalog.providers.find((entry) => entry.id === provider)?.models ?? [];
  const model = models.find((entry) => entry.id === choice.model) ?? models[0];
  return model ? { provider, model: model.id, variant: keptVariant(choice.variant, model) } : choice;
}

export function withModel(catalog: OpenCodeModelCatalog, choice: OpenCodeModelChoice, modelId: string): OpenCodeModelChoice {
  const model = catalog.providers.find((entry) => entry.id === choice.provider)?.models.find((entry) => entry.id === modelId);
  return model ? { ...choice, model: model.id, variant: keptVariant(choice.variant, model) } : choice;
}

export const sameChoice = (a: OpenCodeModelChoice | null, b: OpenCodeModelChoice | null): boolean =>
  a !== null && b !== null && a.provider === b.provider && a.model === b.model && a.variant === b.variant;
