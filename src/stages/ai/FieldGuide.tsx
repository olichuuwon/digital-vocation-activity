import { useEffect, useRef, useState } from 'react';
import { LABELS } from '../../content/stage2Schema';
import ui from '../../components/components.module.css';
import { c, t } from './content';
import s from './ai.module.css';

/**
 * "📖 Field guide" (§3.5.2 support card; solo players get it as a sheet): what each class looks
 * like. Native <dialog> gives focus trapping and Esc. Stages pause their timer while it's open.
 */
export function FieldGuideButton({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpenState] = useState(false);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);

  return (
    <>
      <button type="button" className={s.guideBtn} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true">📖 </span>
        {c.fieldGuide.button}
      </button>
      <dialog ref={ref} className={ui.sheet} aria-labelledby="guide-heading" onClose={() => setOpen(false)}>
        <div className={ui.sheetHead}>
          <h2 id="guide-heading">{c.fieldGuide.heading}</h2>
          <button type="button" className={ui.btn} onClick={() => setOpen(false)}>
            {t.close}
          </button>
        </div>
        <p className={ui.muted}>{c.fieldGuide.intro}</p>
        <dl className={s.guide}>
          {LABELS.map((l) => (
            <div key={l} className={s.guideItem}>
              <dt>{c.labels[l]}</dt>
              <dd>{c.fieldGuide.entries[l]}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          className={`${ui.btn} ${ui.primary}`}
          style={{ width: '100%', marginTop: 16 }}
          onClick={() => setOpen(false)}
        >
          {t.close}
        </button>
      </dialog>
    </>
  );
}
