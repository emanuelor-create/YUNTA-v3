/* Yunta — primitivas de UI extraídas de los diseños.
   Destino sugerido: apps/frontend/src/components/ui/index.tsx
   Solo React 19 + las CSS variables de yunta-design-tokens.css.
   Sin dependencias, sin CSS-in-JS: estilos inline sobre tokens.

   Lo que YA EXISTE en el repo y este archivo NO duplica:
     · components/Avatar.tsx ................ Avatar, initials, colorFor
     · components/YuntaLogo.tsx ............. YuntaMark, YuntaWordmark
     · features/dashboard/priorityStyle.ts .. PRIORITY_LABEL, PRIORITY_STYLE
     · features/board/labelColors.ts ........ LABEL_COLORS, LABEL_COLOR_HEX
     · features/board/icons.tsx ............. Description/Comment/Attachment/Clock
     · features/clients/types.ts ............ PROJECT_MEMBER_ROLE_LABELS y _HINTS
   Ver "Qué reemplaza cada primitiva" en HANDOFF.md.                      */

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

const px = (n: number) => `${n}px`;

/* ── Card ─────────────────────────────────────────────────────────────── */

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-card)",
        background: "var(--card)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

/** Header de card: título + subtítulo a la izquierda, acción a la derecha. */
export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: subtitle ? "flex-end" : "baseline",
        justifyContent: "space-between",
        gap: 16,
        padding: "20px 24px 15px",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink)" }}>
          {title}
        </h2>
        {subtitle && <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{subtitle}</span>}
      </div>
      {action}
    </div>
  );
}

/* ── Label / kicker ───────────────────────────────────────────────────── */

export function Label({ children, track, style }: { children: ReactNode; /** override de letter-spacing */ track?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: "var(--sans)",
        fontSize: "var(--label-size)",
        fontWeight: 600,
        letterSpacing: track ?? "var(--label-track)",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ── Button ───────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: { color: "var(--cream)", background: "var(--ink)", border: "1px solid var(--ink)", fontWeight: 600 },
  ghost: { color: "var(--ink)", background: "transparent", border: "1px solid var(--line-strong)", fontWeight: 500 },
  danger: { color: "var(--accent-ink)", background: "transparent", border: "1px solid var(--accent)", fontWeight: 600 },
};

/* Hover por variante. Sin transition: el cambio es instantáneo (regla 7). */
const BUTTON_HOVER: Record<ButtonVariant, CSSProperties> = {
  primary: { background: "var(--accent)", border: "1px solid var(--accent)" },
  ghost: { borderColor: "var(--ink)", background: "var(--card)" },
  danger: { background: "var(--accent)", color: "var(--cream)" },
};

export function Button({
  children,
  variant = "ghost",
  disabled,
  onClick,
  title,
  style,
  type = "button",
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** "submit" dentro de un <form>: habilita Enter para enviar. */
  type?: "button" | "submit";
  onClick?: () => void;
  title?: string;
  style?: CSSProperties;
}) {
  const base = BUTTON_STYLES[variant];
  const [hover, setHover] = useState(false);
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--sans)",
        fontSize: 14,
        padding: "11px 18px",
        borderRadius: "var(--radius)",
        cursor: disabled ? "default" : "pointer",
        ...base,
        ...(hover && !disabled ? BUTTON_HOVER[variant] : null),
        ...(disabled ? { color: "var(--ink-3)", background: "var(--line-x-soft)", border: "1px solid var(--line-x-soft)" } : null),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ── StatusPill ───────────────────────────────────────────────────────── */

export type PillTone = "neutral" | "accent" | "muted" | "ink";

const PILL_TONES: Record<PillTone, { bg: string; fg: string; bc: string; dot: string }> = {
  neutral: { bg: "var(--card)", fg: "var(--ink)", bc: "var(--line-strong)", dot: "var(--accent)" },
  accent: { bg: "var(--accent-soft)", fg: "var(--accent-ink)", bc: "var(--accent-line)", dot: "var(--accent)" },
  muted: { bg: "var(--neutral-soft)", fg: "var(--ink-3)", bc: "var(--line)", dot: "var(--ink-4)" },
  ink: { bg: "var(--ink)", fg: "var(--cream)", bc: "var(--ink)", dot: "var(--cream)" },
};

export function StatusPill({ children, tone = "neutral", dot = true }: { children: ReactNode; tone?: PillTone; dot?: boolean }) {
  const t = PILL_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontSize: 12.5,
        fontWeight: 500,
        padding: "5px 11px",
        borderRadius: "var(--radius-pill)",
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bc}`,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot }} />}
      {children}
    </span>
  );
}

/* ── Avatar: NO se reimplementa ────────────────────────────────────────
   Ya existe en apps/frontend/src/components/Avatar.tsx (exporta Avatar,
   initials y colorFor). Reusalo tal cual e importá desde ahí:

     import { Avatar, colorFor, initials } from "../Avatar";

   Una sola nota de diseño: su PALETTE son 8 colores brillantes tipo Trello
   (#8b7cf6, #579dff, #4bce97…) que no pertenecen al sistema terracota. Los
   diseños tiñen los avatares con la escala de marca. Si querés esa
   coherencia, reemplazá PALETTE en ese archivo por AVATAR_PALETTE y dejá
   colorFor/initials/el componente intactos.                             */

export const AVATAR_PALETTE = [
  "#1b1917", // ink
  "#b4552f", // accent
  "#8a5a2b", // clay
  "#5c564d", // stone
  "#8a8378", // ink-3
];

/** Dot de estado para superponer a un <Avatar> (el único añadido). */
export function AvatarStatusDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      style={{
        position: "absolute",
        right: -1,
        bottom: -1,
        width: px(size),
        height: px(size),
        borderRadius: "50%",
        border: "2px solid var(--card)",
        background: color,
      }}
    />
  );
}

/* ── PriorityBadge: consume el estilo que ya existe ───────────────────── */
/*  Fuente de verdad: features/dashboard/priorityStyle.ts
    (PRIORITY_LABEL + PRIORITY_STYLE, con vars --accent-bg / --surface-2).
    Los diseños solo cambian la geometría: cápsula, sin dot.            */

// import { PRIORITY_LABEL, PRIORITY_STYLE } from "../../features/dashboard/priorityStyle";
// import type { CardPriority } from "../../features/dashboard/types";

export function PriorityBadge({
  priority,
  label,
  style,
}: {
  /** PRIORITY_STYLE[priority] */
  priority: { bg: string; fg: string };
  /** PRIORITY_LABEL[priority] */
  label: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 500,
        padding: "4px 9px",
        borderRadius: "var(--radius-pill)",
        textAlign: "center",
        background: priority.bg,
        color: priority.fg,
        ...style,
      }}
    >
      {label}
    </span>
  );
}

/* ── ProgressBar + SegmentedBar ───────────────────────────────────────── */

export function ProgressBar({
  pct,
  color = "var(--accent)",
  height = 4,
  track = "var(--line-soft)",
}: { pct: number; color?: string; height?: number; track?: string }) {
  return (
    <span style={{ display: "block", height: px(height), width: "100%", background: track, borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
      <span style={{ display: "block", height: px(height), width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </span>
  );
}

export function SegmentedBar({ segments, height = 12 }: { segments: { n: number; color: string }[]; height?: number }) {
  const total = segments.reduce((a, s) => a + s.n, 0) || 1;
  return (
    <div style={{ display: "flex", height: px(height), width: "100%", background: "var(--neutral-soft)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
      {segments.map((s, i) => (
        <span key={i} style={{ height: px(height), background: s.color, width: `${(s.n / total) * 100}%` }} />
      ))}
    </div>
  );
}

/* ── SettingsRow: la fila de "plantilla" de la configuración ──────────── */

export function SettingsRow({ title, hint, children }: { title: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "186px minmax(0,1fr)",
        gap: 24,
        alignItems: "start",
        padding: "20px 0",
        borderTop: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)" }}>{title}</span>
        {hint && <span style={{ fontSize: 12, lineHeight: 1.45, color: "var(--ink-3)", textWrap: "pretty" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* ── Toggle (switch en cápsula, perilla circular) ─────────────────────── */

export function Toggle({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onChange(!on)}
      style={{
        width: 42,
        height: 24,
        flex: "none",
        border: 0,
        padding: 2,
        borderRadius: "var(--radius-pill)",
        cursor: "pointer",
        background: on ? "var(--accent)" : "var(--neutral)",
        display: "flex",
        justifyContent: on ? "flex-end" : "flex-start",
      }}
    >
      <span style={{ width: 20, height: 20, background: "var(--card)", display: "block", borderRadius: "50%" }} />
    </button>
  );
}

/* ── Modal ────────────────────────────────────────────────────────────── */

export function Modal({
  title,
  kicker,
  width = 720,
  onClose,
  footer,
  header,
  children,
}: {
  title?: string;
  kicker?: string;
  width?: number;
  onClose: () => void;
  footer?: ReactNode;
  /** Reemplaza el header por completo (p. ej. la identidad del usuario). */
  header?: ReactNode;
  children: ReactNode;
}) {
  // Escape cierra el modal (todos: configuración, nuevo proyecto, detalle de tarjeta).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(27,25,23,0.44)" }} />
      <div
        style={{
          position: "relative",
          width: px(width),
          maxWidth: "100%",
          maxHeight: "100%",
          background: "var(--page)",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-modal)",
          boxShadow: "0 24px 64px rgba(27,25,23,0.22)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {header ?? (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 20,
              padding: "22px 26px 18px",
              borderBottom: "1px solid var(--line-strong)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {kicker && <Label>{kicker}</Label>}
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.028em", lineHeight: 1.05, color: "var(--ink)" }}>
                {title}
              </h2>
            </div>
            <Button variant="ghost" onClick={onClose} style={{ fontSize: 20, lineHeight: 1, color: "var(--ink-3)", padding: "6px 11px" }}>
              ×
            </Button>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "20px 26px 24px" }}>{children}</div>

        {footer && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "15px 26px",
              borderTop: "1px solid var(--line-strong)",
              background: "var(--card)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── DataTable: header + filas con la misma grilla ────────────────────── */

export function TableHead({ cols, template }: { cols: ReactNode[]; template: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: template,
        alignItems: "center",
        gap: 16,
        padding: "14px 20px",
        borderBottom: "1px solid var(--line)",
      }}
    >
      {cols.map((c, i) => (
        <Label key={i}>{c}</Label>
      ))}
    </div>
  );
}

export function TableRow({
  template,
  selected,
  onClick,
  children,
}: {
  template: string;
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: template,
        alignItems: "center",
        gap: 16,
        padding: "15px 20px",
        borderBottom: "1px solid var(--line-soft)",
        background: selected ? "var(--row-sel)" : hover ? "var(--row-hover)" : "transparent",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {children}
    </div>
  );
}
