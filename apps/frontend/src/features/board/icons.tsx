import type { CSSProperties } from 'react';

// SVG inline, stroke="currentColor" — el ícono hereda el color del texto
// (SIDEBAR.md). Sin librería de íconos.
interface IconProps {
  size?: number;
  style?: CSSProperties;
}

function baseProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function FolderIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M3 6.5a1 1 0 0 1 1-1h4.4l1.6 2h9a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

export function UsersIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 19c0-3 2.9-5.5 6.5-5.5s6.5 2.5 6.5 5.5" />
      <path d="M16.5 4.5c1.6.3 2.8 1.7 2.8 3.4 0 1.7-1.2 3.1-2.8 3.4" />
      <path d="M18.5 13.7c2 .6 3.5 2.5 3.5 4.8" />
    </svg>
  );
}

export function SettingsIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 13a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 6.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 2.6a1.7 1.7 0 0 0 1.04-1.56V1a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 2.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 6.6c.14.6.63 1.04 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.36Z" />
    </svg>
  );
}

export function CheckIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

export function RefreshIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M20 11a8 8 0 0 0-14.3-4.5L4 9" />
      <path d="M4 4v5h5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.5L20 15" />
      <path d="M20 20v-5h-5" />
    </svg>
  );
}

export function PlusIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ClockIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function DashboardIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <rect x="3.5" y="3.5" width="7" height="8.5" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1" />
      <rect x="3.5" y="15" width="7" height="5.5" rx="1" />
    </svg>
  );
}

export function AttachmentIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M20.5 11.5 12 20a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" />
    </svg>
  );
}

export function StarIcon({ size = 16, filled, style }: IconProps & { filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M12 2.8 14.8 9l6.7.6-5.1 4.4 1.6 6.6-6-3.6-6 3.6 1.6-6.6-5.1-4.4L9.2 9Z" />
    </svg>
  );
}

export function LogoutIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17 21 12 16 7" />
      <path d="M21 12H9" />
    </svg>
  );
}

const CHEVRON_ROTATION = { right: 0, down: 90, left: 180, up: -90 } as const;

export function ChevronIcon({
  size = 8,
  direction = 'right',
  style,
}: IconProps & { direction?: keyof typeof CHEVRON_ROTATION }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: `rotate(${CHEVRON_ROTATION[direction]}deg)`,
        flex: 'none',
        ...style,
      }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
