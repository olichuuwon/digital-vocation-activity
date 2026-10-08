import { useState, type FormEvent } from 'react';
import { copy, fill } from '../../content';
import { groupCopy } from '../../content/groupSchema';
import { groupActions } from '../../net/group';
import { checkGroupName, checkNickname, generateNames, MAX_GROUP_NAME, MAX_NICKNAME, tidy, type TextProblem } from '../../net/group/moderation';
import type { Mode } from '../../state/types';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';
import s from './Group.module.css';

const t = groupCopy.create;
const e = groupCopy.errors;

const nameError: Record<TextProblem, string> = { empty: e.nameEmpty, tooLong: e.nameTooLong, digits: e.nameDigits, blocked: e.nameBlocked };
const nickError: Record<TextProblem, string> = { empty: e.nickEmpty, tooLong: e.nickTooLong, digits: e.nickDigits, blocked: e.nickBlocked };

/** Create a group (§3.5.1): pick a generated name or type one, nickname, run length. */
export function GroupCreate({ facilitatorMode, onBack }: { facilitatorMode: Mode | null; onBack: () => void }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(t.heading);
  const [names, setNames] = useState(() => generateNames(3));
  const [picked, setPicked] = useState(0);
  const [custom, setCustom] = useState<string | null>(null);
  const [nick, setNick] = useState('');
  const [mode, setMode] = useState<Mode>(facilitatorMode ?? 'booth');
  const [tried, setTried] = useState(false);

  const name = custom ?? names[picked] ?? '';
  const nameProblem = checkGroupName(name);
  const nickProblem = checkNickname(nick);

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (nameProblem || nickProblem) {
      document.querySelector<HTMLInputElement>(nameProblem && custom !== null ? '#group-name' : '#group-nick')?.focus();
      return;
    }
    groupActions.create({ name: tidy(name), mode: facilitatorMode ?? mode, nick: tidy(nick) });
  };

  const lengthName = (m: Mode) => (m === 'booth' ? copy.length.booth : copy.length.full);

  return (
    <main className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {t.heading}
      </h1>
      <form className={s.form} onSubmit={submit} noValidate>
        {custom === null ? (
          <fieldset className={s.field}>
            <legend className={s.label}>{t.nameLabel}</legend>
            <div className={s.options} data-testid="name-options">
              {names.map((n, i) => (
                <label key={n} className={s.option}>
                  <input type="radio" name="group-name" checked={picked === i} onChange={() => setPicked(i)} />
                  {n}
                </label>
              ))}
            </div>
            <div className={s.row}>
              <button
                type="button"
                className={ui.btn}
                onClick={() => {
                  setNames(generateNames(3));
                  setPicked(0);
                }}
              >
                {t.moreNames} <span aria-hidden="true">🔀</span>
              </button>
              <button
                type="button"
                className={ui.btn}
                data-own-name
                onClick={() => {
                  setCustom('');
                  // The button goes away: keep focus on the field that replaces it.
                  requestAnimationFrame(() => document.getElementById('group-name')?.focus());
                }}
              >
                {t.ownName} <span aria-hidden="true">✏️</span>
              </button>
            </div>
          </fieldset>
        ) : (
          <div className={s.field}>
            <label className={s.label} htmlFor="group-name">
              {t.customLabel}
            </label>
            <input
              id="group-name"
              className={s.input}
              value={custom}
              maxLength={MAX_GROUP_NAME}
              autoComplete="off"
              autoCapitalize="words"
              aria-invalid={tried && !!nameProblem}
              aria-describedby="group-name-hint group-name-error"
              onChange={(ev) => setCustom(ev.target.value)}
            />
            <p id="group-name-hint" className={s.hint}>
              {t.customHint}
            </p>
            <p id="group-name-error" className={s.error} role={tried && nameProblem ? 'alert' : undefined}>
              {tried && nameProblem ? nameError[nameProblem] : ''}
            </p>
            <button
              type="button"
              className={ui.btn}
              onClick={() => {
                setCustom(null);
                requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-own-name]')?.focus());
              }}
            >
              {t.useGenerated}
            </button>
          </div>
        )}

        <div className={s.field}>
          <label className={s.label} htmlFor="group-nick">
            {t.nicknameLabel}
          </label>
          <input
            id="group-nick"
            className={s.input}
            value={nick}
            maxLength={MAX_NICKNAME}
            autoComplete="off"
            aria-invalid={tried && !!nickProblem}
            aria-describedby="group-nick-hint group-nick-error"
            onChange={(ev) => setNick(ev.target.value)}
          />
          <p id="group-nick-hint" className={s.hint}>
            {t.nicknameHint}
          </p>
          <p id="group-nick-error" className={s.error} role={tried && nickProblem ? 'alert' : undefined}>
            {tried && nickProblem ? nickError[nickProblem] : ''}
          </p>
        </div>

        {facilitatorMode ? (
          <p className={ui.muted}>{fill(t.lengthSet, { length: lengthName(facilitatorMode) })}</p>
        ) : (
          <fieldset className={s.field}>
            <legend className={s.label}>{t.lengthLabel}</legend>
            <div className={s.options}>
              {(['booth', 'full'] as const).map((m) => (
                <label key={m} className={s.option}>
                  <input type="radio" name="group-length" checked={mode === m} onChange={() => setMode(m)} />
                  <span>
                    {lengthName(m)} <span className={ui.detail}>{m === 'booth' ? copy.length.boothDetail : copy.length.fullDetail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className={ui.actions}>
          <button type="submit" className={`${ui.btn} ${ui.primary}`}>
            {t.create}
          </button>
          <button type="button" className={ui.btn} onClick={onBack}>
            <span aria-hidden="true">←</span> {t.back}
          </button>
        </div>
      </form>
    </main>
  );
}
