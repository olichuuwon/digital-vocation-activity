import { useAnnouncer } from '../../app/screenFocus';
import { fill } from '../../content';
import { dealCards, sendAction, useGroup, useTopic } from '../../net/group';
import { c as cloudCopy } from '../cloud/content';
import { sc } from './content';
import { SupportCards } from './SupportCards';
import { useBuzzOnChange } from './useBuzz';
import { BOOST, CONFIG, RESTART, ROLLBACK, S4C, S4M, S4R, s4cSchema, s4mSchema, s4rSchema } from './topics';
import s from './support.module.css';

const pct = (x: number) => Math.floor(x * 100 + 1e-9);

/**
 * Stage 4 support cards (§3.5.2): in the manual storm each support runs its servers' Boost and
 * Restart; in Configure the settings are split (load balancer + self-healing / autoscaler) and
 * everyone sees the budget.
 */
export default function Support4() {
  const g = useGroup();
  const manual = useTopic(S4M, s4mSchema);
  const cfg = useTopic(S4C, s4cSchema);
  const replay = useTopic(S4R, s4rSchema);
  const myServers = dealCards([0, 1, 2], g.supportCount, g.mySupportIndex);
  const myCrashed = manual?.pods.filter((p) => p.status === 'crashed' && myServers.includes(p.id)).map((p) => p.id) ?? [];
  useBuzzOnChange(myCrashed.length ? myCrashed : null, fill(cloudCopy.manual.crashToast, { n: (myCrashed[0] ?? 0) + 1 }));
  const replayAlert = replay && (replay.badDeploy || replay.crashed.length) ? [replay.badDeploy, replay.crashed] : null;
  useBuzzOnChange(
    replayAlert,
    replay?.badDeploy ? cloudCopy.manual.deployToast : fill(cloudCopy.replay.podCrashed, { n: (replay?.crashed[0] ?? 0) + 1 }),
  );
  const announce = (m: string) => useAnnouncer.getState().announce(m);

  if (manual) {
    const pods = manual.pods.filter((p) => myServers.includes(p.id)).sort((a, b) => a.id - b.id);
    return (
      <section className={s.cards} data-testid="support-servers">
        <article className={s.card}>
          <h2 className={s.cardTitle}>{sc.cards.servers.title}</h2>
          <p className={s.instruction}>{sc.cards.servers.instruction}</p>
          {pods.length === 0 && <p className={s.muted}>{sc.cards.servers.none}</p>}
          {pods.map((p) => {
            const name = fill(cloudCopy.manual.server, { n: p.id + 1 });
            const crashed = p.status === 'crashed';
            const off = p.status === 'starting' || (!crashed && (p.boosted || p.cooling));
            const label = crashed
              ? cloudCopy.manual.restart
              : p.status === 'starting'
                ? cloudCopy.manual.rebooting
                : p.boosted
                  ? cloudCopy.manual.boosted
                  : p.cooling
                    ? cloudCopy.manual.cooling
                    : cloudCopy.manual.boost;
            return (
              <div key={p.id} className={s.row}>
                <span>
                  <span aria-hidden="true">{crashed ? '💥 ' : '🖥️ '}</span>
                  {name}: {crashed ? cloudCopy.manual.crashed : fill(cloudCopy.manual.busy, { pct: pct(p.cpu) })}
                </span>
                <button
                  type="button"
                  className={s.actionBtn}
                  aria-disabled={off || undefined}
                  aria-label={`${label}: ${name}`}
                  data-testid={`support-server-${p.id}`}
                  onClick={() => !off && sendAction(crashed ? RESTART : BOOST, { pod: p.id })}
                >
                  {label}
                </button>
              </div>
            );
          })}
        </article>
      </section>
    );
  }

  if (replay) {
    return (
      <section className={s.cards} data-testid="support-replay">
        <article className={s.card}>
          <h2 className={s.cardTitle}>{sc.cards.replay.title}</h2>
          <p className={s.instruction}>{sc.cards.replay.instruction}</p>
          <p className={s.big}>{fill(sc.cards.replay.uptime, { pct: pct(replay.uptime) })}</p>
          <p className={s.row}>
            <span>{fill(sc.cards.replay.pods, { n: replay.pods })}</span>
            <span>
              {fill(cloudCopy.configure.cost, { n: replay.cost })} · {fill(cloudCopy.configure.budget, { n: replay.budget })}
            </span>
          </p>
          {replay.badDeploy && (
            <button type="button" className={s.actionBtn} data-testid="support-rollback" onClick={() => sendAction(ROLLBACK)}>
              <span aria-hidden="true">↩️ </span>
              {sc.cards.replay.rollback}
            </button>
          )}
          {replay.crashed.map((id) => {
            const name = fill(cloudCopy.replay.pod, { n: id + 1 });
            return (
              <div key={id} className={s.row}>
                <span>
                  <span aria-hidden="true">💥 </span>
                  {name}: {cloudCopy.manual.crashed}
                </span>
                <button type="button" className={s.actionBtn} aria-label={`${cloudCopy.manual.restart}: ${name}`} onClick={() => sendAction(RESTART, { pod: id })}>
                  {cloudCopy.manual.restart}
                </button>
              </div>
            );
          })}
          {!replay.badDeploy && replay.crashed.length === 0 && <p className={s.muted}>{sc.cards.replay.none}</p>}
        </article>
      </section>
    );
  }

  if (cfg) {
    const k = cfg.config;
    const toggle = (key: 'loadBalancer' | 'selfHealing' | 'rollingUpdate', label: string) => (
      <div className={s.row} key={key}>
        <span>{label}</span>
        <span role="group" aria-label={label} style={{ display: 'flex', gap: 6 }}>
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              className={s.tab}
              aria-pressed={k[key] === v}
              onClick={() => {
                if (k[key] === v) return;
                sendAction(CONFIG, { [key]: v });
                announce(fill(cloudCopy.configure.changed, { setting: label, value: v ? cloudCopy.configure.on : cloudCopy.configure.off }));
              }}
            >
              {k[key] === v && <span aria-hidden="true">✓ </span>}
              {v ? cloudCopy.configure.on : cloudCopy.configure.off}
            </button>
          ))}
        </span>
      </div>
    );
    /** −/+ pair: aria-disabled at its limits, and the new value is spoken. */
    const steps = (label: string, value: number, lo: number, hi: number, step: number, set: (v: number) => void, show = (v: number) => String(v)) => (
      <span style={{ display: 'flex', gap: 6 }}>
        {([-1, 1] as const).map((dir) => {
          const next = value + dir * step;
          const off = next < lo || next > hi;
          return (
            <button
              key={dir}
              type="button"
              className={`${s.tab} ${s.step}`}
              aria-disabled={off || undefined}
              aria-label={`${dir < 0 ? cloudCopy.configure.fewer : cloudCopy.configure.more}: ${label}`}
              onClick={() => {
                if (off) return;
                set(next);
                announce(fill(cloudCopy.configure.changed, { setting: label, value: show(next) }));
              }}
            >
              {dir < 0 ? '−' : '+'}
            </button>
          );
        })}
      </span>
    );
    const stepper = (key: 'minPods' | 'maxPods', label: string, lo: number, hi: number) => (
      <div className={s.row} key={key}>
        <span>
          {label}: <strong>{k[key]}</strong>
        </span>
        {steps(label, k[key], lo, hi, 1, (v) =>
          // Keep Min ≤ Max, as the main phone's own steppers do.
          sendAction(CONFIG, key === 'minPods' ? { minPods: v, maxPods: Math.max(v, k.maxPods) } : { maxPods: v, minPods: Math.min(v, k.minPods) }),
        )}
      </div>
    );
    const th = pct(k.scaleUpCpu);
    return (
      <>
        <p className={s.row} data-testid="support-budget">
          {fill(cloudCopy.configure.cost, { n: Math.round(cfg.cost) })} · {fill(cloudCopy.configure.budget, { n: cfg.budget })}
        </p>
        <SupportCards
          stage={4}
          only={['balancer', 'autoscaler']}
          render={{
            balancer: (
              <>
                {toggle('loadBalancer', cloudCopy.configure.loadBalancer)}
                {toggle('selfHealing', cloudCopy.configure.selfHealing)}
                {toggle('rollingUpdate', cloudCopy.configure.rolling)}
              </>
            ),
            autoscaler: (
              <>
                {stepper('minPods', cloudCopy.configure.minPods, 1, 12)}
                {stepper('maxPods', cloudCopy.configure.maxPods, 1, 12)}
                <div className={s.row}>
                  <span>
                    {cloudCopy.configure.thresholdLabel}: <strong>{th}%</strong>
                  </span>
                  {steps(cloudCopy.configure.thresholdLabel, th, 40, 90, 5, (v) => sendAction(CONFIG, { scaleUpCpu: v / 100 }), (v) => `${v}%`)}
                </div>
              </>
            ),
          }}
        />
      </>
    );
  }

  return <p className={s.muted}>{sc.common.waiting}</p>;
}
