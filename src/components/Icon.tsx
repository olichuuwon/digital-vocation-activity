import { ICONS, type IconName } from './icons';

export { ICONS, ICON_NAMES, type IconName } from './icons';

export function Icon({
  name,
  size = '1.125em',
  strokeWidth = 1.75,
  className,
  filled = false,
}: {
  name: IconName;
  size?: number | string;
  strokeWidth?: number;
  className?: string;
  /** Solid fill (filled stars). */
  filled?: boolean;
}) {
  const C = ICONS[name];
  return (
    <C
      aria-hidden="true"
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
      fill={filled ? 'currentColor' : 'none'}
      className={className ? `icon ${className}` : 'icon'}
    />
  );
}

/** 0–3 stars: filled vs outline, so the count never relies on colour (decorative; label it outside). */
export function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', gap: 2, verticalAlign: 'middle' }}>
      {[1, 2, 3].map((i) => (
        <Icon key={i} name="star" size={size} filled={i <= n} />
      ))}
    </span>
  );
}
