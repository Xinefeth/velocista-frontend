// Nota visible bajo una ranura del Armador con lo que el perfil prohíbe (HU-10): motivo de la
// ranura entera, pieza elegida que dejó de estar permitida, lista «No permitidos aquí» y tope de
// cantidad. Es texto visible (no solo tooltip) y se enlaza al control con aria-describedby.
import { ICO } from "@/ui/components/UiIcons";

export interface BlockedItem {
  name: string;
  reason: string;
}

interface Props {
  id: string;
  /** Motivo de la ranura entera, o "" si la ranura está libre. */
  slotReason: string;
  /** Pieza ya elegida que el perfil actual prohíbe (se conserva y se marca). */
  selected: BlockedItem | null;
  /** Ítems del catálogo prohibidos en esta ranura. */
  items: BlockedItem[];
  /** Tope de cantidad: motivo y si ya se alcanzó. */
  limit: { reason: string; reached: boolean } | null;
}

/** Cuántos motivos se muestran abiertos antes de plegar la lista. */
const OPEN_MAX = 3;

/** ¿Esta ranura tiene algo que explicar? (para decidir si se enlaza aria-describedby). */
export const hasBlockNote = (p: Omit<Props, "id">): boolean =>
  !!p.slotReason || !!p.selected || p.items.length > 0 || !!p.limit;

export function SlotBlockNote({ id, slotReason, selected, items, limit }: Props) {
  const list = (
    <ul>
      {items.map((x) => (
        <li key={x.name}>
          <b>{x.name}</b>: {x.reason}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="blocknote" id={id}>
      {slotReason && (
        <p className="blk-reason">
          {ICO.lock}
          <span>{slotReason}</span>
        </p>
      )}
      {selected && (
        <p className="blk-mark" role="status">
          {ICO.lock}
          <span>
            <b>No permitido</b> · {selected.reason}. Se conserva «{selected.name}»: cámbiala o elige
            — Ninguno —.
          </span>
        </p>
      )}
      {items.length > 0 &&
        (items.length > OPEN_MAX ? (
          <details>
            <summary>No permitidos aquí ({items.length})</summary>
            {list}
          </details>
        ) : (
          <div>
            <p className="blk-head">No permitidos aquí:</p>
            {list}
          </div>
        ))}
      {limit && (
        <p className="blk-reason">
          {limit.reached && ICO.lock}
          <span>{limit.reason}</span>
        </p>
      )}
    </div>
  );
}
