import { fill } from '../../content';
import { useTopic } from '../../net/group';
import { sc } from './content';
import { SupportCards } from './SupportCards';
import { useBuzzOnChange } from './useBuzz';
import { S3, s3Schema } from './topics';
import s from './support.module.css';

/** Stage 3 support cards: Scout map, Manifest, Debugger (§3.5.2). */
export default function Support3() {
  const t = useTopic(S3, s3Schema);
  useBuzzOnChange(t ? [t.flooded, t.debug?.stoppedAt] : null, sc.common.newInfo);
  return (
    <SupportCards
      stage={3}
      news={{ scout: t?.flooded, manifest: t?.needs, debugger: t?.debug?.stoppedAt }}
      render={{
        scout: t && (t.flooded.length || t.dry.length) ? (
          <div data-testid="support-scout">
            {t.flooded.map((w) => (
              <p key={w} className={s.big}>
                <span aria-hidden="true">🌊 </span>
                {fill(sc.cards.scout.flooded, { where: w })}
              </p>
            ))}
            {t.dry.map((w) => (
              <p key={w} className={s.row}>
                <span aria-hidden="true">✅ </span>
                {fill(sc.cards.scout.dry, { where: w })}
              </p>
            ))}
          </div>
        ) : (
          <p className={s.muted}>{sc.cards.scout.none}</p>
        ),
        manifest: t?.needs.length ? (
          <ul className={s.list} data-testid="support-manifest">
            {t.needs.map((n) => (
              <li key={n.house}>{fill(sc.cards.manifest.needs, { house: n.house, item: n.item })}</li>
            ))}
          </ul>
        ) : t?.houses.length ? (
          <>
            <p className={s.muted}>{sc.cards.manifest.route}</p>
            <ul className={s.list}>
              {t.houses.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className={s.muted}>{sc.cards.manifest.none}</p>
        ),
        debugger: t?.debug ? (
          <>
            {t.debug.stoppedAt && <p className={s.big}>{fill(sc.cards.debugger.stoppedAt, { block: t.debug.stoppedAt })}</p>}
            <ol className={s.list} data-testid="support-debug">
              {t.debug.steps.map((st, i) => (
                <li key={i}>{st}</li>
              ))}
            </ol>
          </>
        ) : (
          <p className={s.muted}>{sc.cards.debugger.none}</p>
        ),
      }}
    />
  );
}
