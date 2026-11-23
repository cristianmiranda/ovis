import { X } from "lucide-react";
import { useT } from "../lib/i18n.ts";
import { SHEET_QUERY } from "../lib/sheets.ts";
import { useMediaQuery } from "../lib/useMediaQuery.ts";

/* iOS's search field: a filled round clear inside the field, and on a phone sheet a worded Cancel beside it,
   so the two never look alike. */
export function SearchClear({ onClear }: { onClear: () => void }) {
  const t = useT();
  return (
    <button type="button" className="search-clear" tabIndex={-1} aria-label={t("Clear search")} title={t("Clear search")}
      onMouseDown={(event) => event.preventDefault()} onClick={onClear}>
      <span className="search-clear-disc"><X aria-hidden="true" /></span>
    </button>
  );
}

export function SearchSheetClose({ label, onClose }: { label: string; onClose: () => void }) {
  const t = useT();
  return useMediaQuery(SHEET_QUERY)
    ? <button type="button" className="btn btn-ghost search-cancel" onClick={onClose}>{t("Cancel")}</button>
    : <button type="button" className="icon-button" aria-label={label} title={label} onClick={onClose}><X /></button>;
}
