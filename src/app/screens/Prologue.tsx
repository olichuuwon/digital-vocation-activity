import { copy } from '../../content';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';

const pr = copy.prologue;

/** Stage 0 (§2): mission briefing + a 10-second how-to-play, then Stage 1. */
export function Prologue({ onGo }: { onGo: () => void }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(pr.heading);
  return (
    <main className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1} data-testid="prologue-heading">
        <span aria-hidden="true">🌊 </span>
        {pr.heading}
      </h1>
      <p>{pr.body}</p>
      <section aria-labelledby="tips-h" className={ui.card}>
        <h2 id="tips-h" style={{ fontSize: '1.125rem', margin: '0 0 8px' }}>
          {pr.tipsHeading}
        </h2>
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pr.tips.map((tip) => (
            <li key={tip.text}>
              <span aria-hidden="true">{tip.icon} </span>
              {tip.text}
            </li>
          ))}
        </ul>
      </section>
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onGo}>
          {pr.go}
        </button>
      </div>
    </main>
  );
}
