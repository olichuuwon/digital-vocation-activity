import { useState, type FormEvent } from 'react';
import { groupCopy } from '../../content/groupSchema';
import { groupActions, useGroup } from '../../net/group';
import { normaliseCode } from '../../net/group/codes';
import { checkNickname, MAX_NICKNAME, tidy, type TextProblem } from '../../net/group/moderation';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';
import s from './Group.module.css';

const t = groupCopy.join;
const e = groupCopy.errors;
const nickError: Record<TextProblem, string> = { empty: e.nickEmpty, tooLong: e.nickTooLong, digits: e.nickDigits, blocked: e.nickBlocked };

/** Join a group (§3.5.1): code (prefilled from the leader's QR) + nickname. */
export function GroupJoin({ initialCode, onBack }: { initialCode: string; onBack: () => void }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(t.heading);
  const group = useGroup();
  const [code, setCode] = useState(initialCode);
  const [nick, setNick] = useState('');
  const [tried, setTried] = useState(false);
  const looking = group.status === 'joining';
  const joinError = group.snap.joinError;

  const codeOk = normaliseCode(code);
  const nickProblem = checkNickname(nick);
  const codeMsg = tried && !codeOk ? e.badCode : '';
  const nickMsg = tried && nickProblem ? nickError[nickProblem] : '';

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (looking) return;
    setTried(true);
    if (!codeOk) return document.querySelector<HTMLInputElement>('#join-code')?.focus();
    if (nickProblem) return document.querySelector<HTMLInputElement>('#join-nick')?.focus();
    groupActions.join({ code: codeOk, nick: tidy(nick) });
  };

  return (
    <main className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {t.heading}
      </h1>
      <form className={s.form} onSubmit={submit} noValidate>
        <div className={s.field}>
          <label className={s.label} htmlFor="join-code">
            {t.codeLabel}
          </label>
          <input
            id="join-code"
            className={s.codeInput}
            value={code}
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={!!codeMsg}
            aria-describedby="join-code-hint join-code-error"
            onChange={(ev) => setCode(ev.target.value.toUpperCase())}
          />
          <p id="join-code-hint" className={s.hint}>
            {t.codeHint}
          </p>
          <p id="join-code-error" className={s.error} role={codeMsg ? 'alert' : undefined}>
            {codeMsg}
          </p>
        </div>
        <div className={s.field}>
          <label className={s.label} htmlFor="join-nick">
            {t.nicknameLabel}
          </label>
          <input
            id="join-nick"
            className={s.input}
            value={nick}
            maxLength={MAX_NICKNAME}
            autoComplete="off"
            aria-invalid={!!nickMsg}
            aria-describedby="join-nick-hint join-nick-error"
            onChange={(ev) => setNick(ev.target.value)}
          />
          <p id="join-nick-hint" className={s.hint}>
            {t.nicknameHint}
          </p>
          <p id="join-nick-error" className={s.error} role={nickMsg ? 'alert' : undefined}>
            {nickMsg}
          </p>
        </div>
        <p role="status" aria-live="polite" className={joinError ? s.error : ui.muted} data-testid="join-status">
          {looking ? t.looking : joinError ? e[joinError] : ''}
        </p>
        <div className={ui.actions}>
          <button type="submit" className={`${ui.btn} ${ui.primary}`} aria-disabled={looking || undefined}>
            {t.join}
          </button>
          <button
            type="button"
            className={ui.btn}
            onClick={() => {
              if (looking) groupActions.leave();
              groupActions.dismiss();
              onBack();
            }}
          >
            <span aria-hidden="true">←</span> {t.back}
          </button>
        </div>
      </form>
    </main>
  );
}
