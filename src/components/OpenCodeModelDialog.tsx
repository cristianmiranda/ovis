/**
 * The model, provider and effort of an OpenCode pane's session, picked from the models OpenCode's own
 * service lists and switched through it: the TUI follows at once, nothing is typed into the pane. Three
 * native selects, as the Codex and Claude apps' model menus are short lists; on a phone each opens the
 * system's own picker. Cancel takes the focus, so Enter, Escape and the scrim change nothing.
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import "./OpenCodeModelDialog.css";

import type { OpenCodeModelCatalog, OpenCodeModelChoice } from "../../shared/protocol.ts";
import { ApiError, fetchOpenCodeModels, switchOpenCodeModel } from "../lib/api.ts";
import { useT } from "../lib/i18n.ts";
import { initialChoice, sameChoice, withModel, withProvider } from "../lib/openCodeModel.ts";
import { useMachineId } from "../lib/machineContext.tsx";
import { nativeModalOver, useFocusTrap } from "../lib/useFocusTrap.ts";
import { useSheetSwipe } from "../lib/sheets.ts";
import { usePhoneSheetBack } from "../lib/sheetHistory.ts";

interface Props {
  paneId: string;
  /** after OpenCode took the switch, with what it was switched to */
  onSwitched: (choice: OpenCodeModelChoice) => void;
  onClose: () => void;
}

const failure = (reason: unknown): string => reason instanceof ApiError ? reason.detail : reason instanceof Error ? reason.message : String(reason);

export function OpenCodeModelDialog({ paneId, onSwitched, onClose }: Props) {
  const t = useT();
  const id = useId();
  const machineId = useMachineId();
  const cancel = useRef<HTMLButtonElement>(null);
  const surface = useFocusTrap<HTMLDivElement>(true, { initialFocus: cancel });
  const [catalog, setCatalog] = useState<OpenCodeModelCatalog | null>(null);
  const [choice, setChoice] = useState<OpenCodeModelChoice | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useSheetSwipe(surface, pending ? null : onClose);
  usePhoneSheetBack(() => { if (pending) return false; onClose(); });

  useEffect(() => {
    const abort = new AbortController();
    fetchOpenCodeModels(paneId, machineId, abort.signal).then((read) => {
      setCatalog(read);
      setChoice(initialChoice(read));
    }, (reason: unknown) => { if (!abort.signal.aborted) setError(failure(reason)); });
    return () => abort.abort();
  }, [paneId, machineId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || nativeModalOver(surface.current)) return;
      event.stopPropagation();
      event.preventDefault();
      if (!pending) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, pending]);

  const provider = catalog?.providers.find((entry) => entry.id === choice?.provider);
  const model = provider?.models.find((entry) => entry.id === choice?.model);
  const unchanged = sameChoice(choice, catalog?.current ?? null);
  const pickProvider = (next: string): void => { if (catalog && choice) setChoice(withProvider(catalog, choice, next)); };
  const pickModel = (next: string): void => { if (catalog && choice) setChoice(withModel(catalog, choice, next)); };

  const save = async (): Promise<void> => {
    if (!choice) return;
    setPending(true);
    setError(null);
    try {
      await switchOpenCodeModel(paneId, choice, machineId);
      onSwitched(choice);
    } catch (reason: unknown) {
      setError(failure(reason));
      setPending(false);
    }
  };

  const disabled = pending || catalog === null;
  return createPortal(
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
      <div ref={surface} className="modal opencode-model-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-busy={catalog === null && error === null} tabIndex={-1}>
        <header className="modal-header"><h2 className="modal-title" id={`${id}-title`}>{t("Change model")}</h2></header>
        <div className="modal-body opencode-model-fields">
          {catalog === null && error === null && <p className="opencode-model-note">{t("Loading…")}</p>}
          {catalog !== null && choice !== null && <>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-provider`}>{t("Provider")}</label>
              <select id={`${id}-provider`} className="select" value={choice.provider} disabled={disabled} onChange={(event) => pickProvider(event.target.value)}>
                {catalog.providers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-model`}>{t("Model")}</label>
              <select id={`${id}-model`} className="select" value={choice.model} disabled={disabled} onChange={(event) => pickModel(event.target.value)}>
                {provider?.models.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </div>
            {model && model.variants.length > 0 && <div className="field">
              <label className="field-label" htmlFor={`${id}-effort`}>{t("Effort")}</label>
              <select id={`${id}-effort`} className="select" value={choice.variant ?? ""} disabled={disabled} onChange={(event) => setChoice({ ...choice, variant: event.target.value === "" ? null : event.target.value })}>
                <option value="">{t("Model default")}</option>
                {model.variants.map((variant) => <option key={variant} value={variant}>{variant}</option>)}
              </select>
            </div>}
          </>}
          {error && <p className="opencode-model-error" role="alert">{error}</p>}
        </div>
        <footer className="modal-footer">
          <button ref={cancel} type="button" className="btn" disabled={pending} onClick={onClose}>{t("Cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={disabled || choice === null || unchanged} onClick={() => void save()}>{t("Save")}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
