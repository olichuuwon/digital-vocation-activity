import { playCue, unlockSound } from './sound';
import { useEffect, useRef } from 'react';
import { copy } from '../content';
import { useGame } from '../state/store';
import type { Theme } from '../state/types';
import ui from './ui.module.css';

const t = copy.settings;

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const settings = useGame((s) => s.settings);
  const updateSettings = useGame((s) => s.updateSettings);
  const hasRun = useGame((s) => s.run !== null);
  const quitRun = useGame((s) => s.quitRun);
  const teamRelaxed = useGame((s) => s.teamRelaxed);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);

  const themes: [Theme, string][] = [
    ['system', t.themeSystem],
    ['light', t.themeLight],
    ['dark', t.themeDark],
  ];

  return (
    <dialog ref={ref} className="settings" aria-labelledby="settings-heading" onClose={onClose}>
      <div className={ui.screen}>
        <h2 id="settings-heading">{t.heading}</h2>
        <fieldset className="settings-group">
          <legend>{t.theme}</legend>
          {themes.map(([value, label]) => (
            <label key={value} className="settings-row">
              <input
                type="radio"
                name="theme"
                value={value}
                checked={settings.theme === value}
                onChange={() => updateSettings({ theme: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => {
              updateSettings({ sound: e.target.checked });
              // Turning sound on is a tap: unlock audio (iOS) and play a sample.
              if (e.target.checked) {
                unlockSound();
                playCue('success');
              }
            }}
          />
          {t.sound}
        </label>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={settings.relaxed}
            onChange={(e) => updateSettings({ relaxed: e.target.checked })}
          />
          {t.relaxed}
        </label>
        {teamRelaxed && !settings.relaxed && <p className="settings-note">{t.teamRelaxed}</p>}
        <div className={ui.actions}>
          {hasRun && (
            <button
              type="button"
              className={ui.btn}
              onClick={() => {
                quitRun();
                onClose();
              }}
            >
              {t.quit}
            </button>
          )}
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </dialog>
  );
}
