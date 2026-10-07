import { useState, type ReactNode } from 'react';
import { fill } from '../../content';
import { SUPPORT_CARDS, type SupportStage } from '../../content/supportSchema';
import { useDealtCards } from '../../net/group';
import { sc } from './content';
import s from './support.module.css';

type CardId = (typeof SUPPORT_CARDS)[SupportStage][number];

/**
 * The support cards this phone holds for a stage (§3.5.2): one card, or tabs when a single
 * support holds them all. `render` gives each card's live body.
 */
export function SupportCards({ stage, render }: { stage: SupportStage; render: Partial<Record<CardId, ReactNode>> }) {
  const cards = useDealtCards<CardId>(SUPPORT_CARDS[stage] as readonly CardId[]);
  const [tab, setTab] = useState(0);
  const current = cards[Math.min(tab, cards.length - 1)];
  if (!current) return <p className={s.muted}>{sc.common.waiting}</p>;
  const info = sc.cards[current];
  return (
    <section className={s.cards} data-testid="support-cards" data-cards={cards.join(',')}>
      {cards.length > 1 && (
        <div role="tablist" aria-label={sc.common.tabsLabel} className={s.tabs}>
          {cards.map((id, i) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={i === tab}
              className={s.tab}
              onClick={() => setTab(i)}
            >
              {sc.cards[id].title}
            </button>
          ))}
        </div>
      )}
      <article className={s.card} role={cards.length > 1 ? 'tabpanel' : undefined} data-card={current}>
        <h2 className={s.cardTitle}>{cards.length > 1 ? info.title : fill(sc.common.yourCard, { title: info.title })}</h2>
        <p className={s.instruction}>{info.instruction}</p>
        <div className={s.body}>{render[current] ?? <p className={s.muted}>{sc.common.waiting}</p>}</div>
      </article>
    </section>
  );
}
