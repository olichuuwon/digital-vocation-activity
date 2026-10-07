import { fill, rulebook } from '../../content';
import { useTopic } from '../../net/group';
import { sc } from './content';
import { SupportCards } from './SupportCards';
import { useBuzzOnChange } from './useBuzz';
import { S1, s1Schema } from './topics';
import s from './support.module.css';

/** Stage 1 support cards: Rulebook, duplicate scanner, fix kit (§3.5.2). */
export default function Support1() {
  const t = useTopic(S1, s1Schema);
  useBuzzOnChange(t?.fix ?? null);
  const rules = rulebook.rules.filter((r) => (t?.rules ?? [1]).includes(r.id));
  return (
    <SupportCards
      stage={1}
      render={{
        rulebook: (
          <ol className={s.list} data-testid="support-rules">
            {rules.map((r) => (
              <li key={r.id}>
                {r.title}
                <span style={{ display: 'block', fontWeight: 400 }}>{r.body}</span>
              </li>
            ))}
          </ol>
        ),
        duplicates: t?.kept.length ? (
          <p className={s.big} data-testid="support-kept">
            {fill(sc.cards.duplicates.seen, { ids: t.kept.join(', ') })}
          </p>
        ) : (
          <p className={s.muted}>{sc.cards.duplicates.none}</p>
        ),
        fixKit: t?.fix ? (
          <p className={s.big} data-testid="support-fix">
            {fill(sc.cards.fixKit.answer, { fix: t.fix })}
          </p>
        ) : (
          <p className={s.muted}>{sc.cards.fixKit.none}</p>
        ),
      }}
    />
  );
}
