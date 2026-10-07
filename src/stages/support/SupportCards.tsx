import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { fill } from '../../content';
import { SUPPORT_CARDS, type SupportStage } from '../../content/supportSchema';
import { useDealtCards } from '../../net/group';
import { sc } from './content';
import s from './support.module.css';

type CardId = (typeof SUPPORT_CARDS)[SupportStage][number];

/**
 * The support cards this phone holds for a stage (§3.5.2): one card, or tabs when a single
 * support holds them all (WAI-ARIA tabs: roving tabindex, arrows/Home/End). `render` gives each
 * card's live body; `news` gives the values whose change puts a "New" badge on a hidden tab.
 */
export function SupportCards({
  stage,
  render,
  news = {},
  live = {},
  only,
}: {
  stage: SupportStage;
  render: Partial<Record<CardId, ReactNode>>;
  news?: Partial<Record<CardId, unknown>>;
  /** Cards with something to do right now: until the player picks a tab, the first live one shows. */
  live?: Partial<Record<CardId, boolean>>;
  /** Deal only these of the stage's cards (a phase that doesn't use them all). */
  only?: readonly CardId[];
}) {
  const cards = useDealtCards<CardId>(only ?? (SUPPORT_CARDS[stage] as readonly CardId[]));
  const [picked, setPicked] = useState<number | null>(null);
  const firstLive = cards.findIndex((id) => live[id]);
  const tab = picked ?? Math.max(0, firstLive);
  const keyOf = (id: CardId) => JSON.stringify(news[id] ?? null);
  /** The news value each card had when last looked at. */
  const [seen, setSeen] = useState<Partial<Record<CardId, string>>>(() =>
    Object.fromEntries((SUPPORT_CARDS[stage] as readonly CardId[]).map((id) => [id, JSON.stringify(news[id] ?? null)])),
  );
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sel = Math.max(0, Math.min(tab, cards.length - 1));
  const current = cards[sel];
  if (!current) return <p className={s.muted}>{sc.common.waiting}</p>;
  const info = sc.cards[current];
  const tabbed = cards.length > 1;

  const select = (i: number, focus = false) => {
    const next = cards[i];
    if (!next) return;
    setSeen((x) => ({ ...x, [current]: keyOf(current), [next]: keyOf(next) }));
    setPicked(i);
    if (focus) tabRefs.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const n = cards.length;
    const to = { ArrowRight: (sel + 1) % n, ArrowLeft: (sel - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(to, true);
  };

  return (
    <section className={s.cards} data-testid="support-cards" data-cards={cards.join(',')}>
      {tabbed && (
        <div role="tablist" aria-label={sc.common.tabsLabel} className={s.tabs} onKeyDown={onKey}>
          {cards.map((id, i) => {
            const fresh = i !== sel && keyOf(id) !== (seen[id] ?? 'null');
            return (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`sc-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={i === sel}
                aria-controls="sc-panel"
                tabIndex={i === sel ? 0 : -1}
                className={s.tab}
                onClick={() => select(i)}
              >
                {sc.cards[id].title}
                {fresh && <span className={s.badge}>{sc.common.newBadge}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div
        id={tabbed ? 'sc-panel' : undefined}
        role={tabbed ? 'tabpanel' : undefined}
        aria-labelledby={tabbed ? `sc-tab-${current}` : undefined}
        tabIndex={tabbed ? 0 : undefined}
      >
        <article className={s.card} data-card={current}>
          <h2 className={s.cardTitle}>{tabbed ? info.title : fill(sc.common.yourCard, { title: info.title })}</h2>
          <p className={s.instruction}>{info.instruction}</p>
          <div className={s.body}>{render[current] ?? <p className={s.muted}>{sc.common.waiting}</p>}</div>
        </article>
      </div>
    </section>
  );
}
