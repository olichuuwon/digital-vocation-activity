import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import type { DataRecord } from '../../content/stage1Schema';
import { c } from './content';
import s from './data.module.css';

export type CardAction = 'keep' | 'trash' | 'fix';

const SWIPE_X = 100;
const SWIPE_Y = 90;

function formatWater(w: DataRecord['water']) {
  return w ? `${w.value} ${w.unit}` : null;
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value === null || value === '' ? <span className={s.blank}>{c.fieldLabels.missing}</span> : value}</dd>
    </>
  );
}

/**
 * One household request. Swipe right = keep, left = trash, up = fix (when allowed).
 * Every swipe has a button twin below the card (§10), so dragging is never required.
 */
export function RecordCard({
  record,
  allowFix,
  onAction,
  debug,
}: {
  record: DataRecord;
  allowFix: boolean;
  onAction: (a: CardAction) => void;
  debug?: boolean;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const keepOpacity = useTransform(x, [20, SWIPE_X], [0, 1]);
  const trashOpacity = useTransform(x, [-SWIPE_X, -20], [1, 0]);
  const fixOpacity = useTransform(y, [-SWIPE_Y, -20], [1, 0]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { x: dx, y: dy } = info.offset;
    if (allowFix && dy < -SWIPE_Y && Math.abs(dy) > Math.abs(dx)) onAction('fix');
    else if (dx > SWIPE_X) onAction('keep');
    else if (dx < -SWIPE_X) onAction('trash');
  };

  return (
    <motion.article
      className={s.card}
      style={{ x, y, rotate }}
      drag={allowFix ? true : 'x'}
      dragSnapToOrigin
      dragElastic={0.6}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      aria-label={`${c.fieldLabels.household} ${record.household}`}
      data-testid="record-card"
      data-id={debug ? record.id : undefined}
      data-status={debug ? record.status : undefined}
      data-fix={debug && record.fix ? record.fix.correct : undefined}
    >
      <motion.span className={`${s.stamp} ${s.stampKeep}`} style={{ opacity: keepOpacity }} aria-hidden="true">
        {c.actions.keep}
      </motion.span>
      <motion.span className={`${s.stamp} ${s.stampTrash}`} style={{ opacity: trashOpacity }} aria-hidden="true">
        {c.actions.trash}
      </motion.span>
      {allowFix && (
        <motion.span className={`${s.stamp} ${s.stampFix}`} style={{ opacity: fixOpacity }} aria-hidden="true">
          {c.actions.fix}
        </motion.span>
      )}
      <dl className={s.fields}>
        <Field label={c.fieldLabels.household} value={record.household} />
        <Field label={c.fieldLabels.sector} value={record.sector} />
        <Field label={c.fieldLabels.people} value={record.people} />
        <Field label={c.fieldLabels.water} value={formatWater(record.water)} />
      </dl>
    </motion.article>
  );
}

/** Keep / Fix / Trash buttons: the always-available alternative to swiping. */
export function CardActions({
  allowFix,
  disabled,
  onAction,
}: {
  allowFix: boolean;
  disabled?: boolean;
  onAction: (a: CardAction) => void;
}) {
  const btn = (kind: CardAction, label: string, dir: string) => (
    <button type="button" className={s.action} data-kind={kind} disabled={disabled} onClick={() => onAction(kind)}>
      <span>{label}</span>
      <span className={s.dir} aria-hidden="true">
        {dir}
      </span>
    </button>
  );
  return (
    <div className={s.actions} style={{ '--cols': allowFix ? 3 : 2 } as React.CSSProperties}>
      {btn('trash', c.actions.trash, '← swipe')}
      {allowFix && btn('fix', c.actions.fix, '↑ swipe')}
      {btn('keep', c.actions.keep, 'swipe →')}
    </div>
  );
}
