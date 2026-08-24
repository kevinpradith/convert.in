import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'plain' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow-accent hover:brightness-110',
  plain: 'glass-strong specular text-ink ring-1 ring-line shadow-tile hover:brightness-[1.04]',
  ghost: 'text-muted hover:bg-fill hover:text-ink',
}

/** Capsule controls, the shape the current Apple design language settled on. */
export function Button({
  variant = 'plain',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-control shrink-0 items-center gap-1.5 rounded-capsule px-3.5 text-body',
        'font-medium whitespace-nowrap transition-all duration-200 ease-glass select-none',
        // Fingers need a bigger target than a cursor does.
        'touch:h-touch touch:px-4',
        'active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}

/**
 * Equal-width cells so the selected indicator can slide by whole steps, which
 * is a transform rather than a layout measurement.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (value: T) => void
  label?: string
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid rounded-capsule bg-fill p-[2px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="glass-strong specular pointer-events-none absolute top-[2px] bottom-[2px] left-[2px] rounded-capsule shadow-thumb transition-transform duration-300 ease-glass"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cx(
            'relative h-control-sm touch:h-10 rounded-capsule px-2.5 text-footnote font-medium',
            'transition-colors duration-200',
            option.value === value ? 'text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-[28px] touch:h-touch rounded-inner bg-surface px-2.5 text-body ring-1 ring-line',
        'focus:outline-2 focus:outline-offset-0 focus:outline-ink',
        className,
      )}
      {...rest}
    />
  )
}

/** Native select: five options is past the point a segmented control stays readable. */
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'h-[28px] touch:h-touch rounded-inner bg-surface px-2 text-body ring-1 ring-line',
        'focus:outline-2 focus:outline-offset-0 focus:outline-ink',
        className,
      )}
      {...rest}
    />
  )
}

/**
 * A caption beside a control. Deliberately not a <label>: most of these wrap a
 * group of buttons, and a label pointing at several controls names none of them.
 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
    </div>
  )
}

/* Monochrome line icons on a 16-unit grid, sized to the 13px text baseline. */

function Icon({
  children,
  size = 14,
  stroke = 1.4,
}: {
  children: ReactNode
  size?: number
  stroke?: number
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const MenuIcon = () => (
  <Icon size={16}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Icon>
)

interface IconProps {
  size?: number
  stroke?: number
}

/** The app logo matching the light/dark mode preference. */
export function Logo({ className = 'h-6 w-auto' }: { className?: string }) {
  return (
    <span className="inline-flex items-center">
      <img
        src="./images/logo/light-mode/logo-while-lightmode.webp"
        alt="convert.in"
        className={cx('theme-logo-light object-contain', className)}
      />
      <img
        src="./images/logo/dark-mode/logo-while-darkmode.webp"
        alt="convert.in"
        className={cx('theme-logo-dark object-contain', className)}
      />
    </span>
  )
}

/** The app mark: the conversion arrow on its own, in ink. */
export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden="true"
      className="text-ink shrink-0"
    >
      <path
        d="M3 10h13M11.4 5.4 16 10l-4.6 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const PlusIcon = () => (
  <Icon>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
)

export const RotateIcon = () => (
  <Icon>
    <path d="M13 8a5 5 0 1 1-1.6-3.7" />
    <path d="M13 2.5V5h-2.5" />
  </Icon>
)

export const TrashIcon = () => (
  <Icon>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5" />
  </Icon>
)

export const DownloadIcon = () => (
  <Icon>
    <path d="M8 2.5v7.5M5 7.5 8 10.5l3-3M3 13h10" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon>
    <path d="M3.5 8.5 6.5 11.5l6-7" />
  </Icon>
)

export const LockIcon = ({ size = 40, stroke = 0.9 }: IconProps) => (
  <Icon size={size} stroke={stroke}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.8" />
    <path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" />
  </Icon>
)

export const StampIcon = ({ size = 40, stroke = 0.9 }: IconProps) => (
  <Icon size={size} stroke={stroke}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    <path d="M5 11 11 5M5.5 5.5h.01M10.5 10.5h.01" />
  </Icon>
)

export const ImageIcon = ({ size = 40, stroke = 0.9 }: IconProps) => (
  <Icon size={size} stroke={stroke}>
    <rect x="2" y="3" width="12" height="10" rx="2.5" />
    <circle cx="5.75" cy="6.25" r="1" />
    <path d="M2.5 11 6 8l2.5 2 2-1.5L13.5 11" />
  </Icon>
)

export const PagesIcon = ({ size = 40, stroke = 0.9 }: IconProps) => (
  <Icon size={size} stroke={stroke}>
    <rect x="2" y="2.5" width="8" height="11" rx="2" />
    <path d="M12 4.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2" />
  </Icon>
)

export const ExportIcon = ({ size = 40, stroke = 0.9 }: IconProps) => (
  <Icon size={size} stroke={stroke}>
    <rect x="2" y="2.5" width="7.5" height="11" rx="2" />
    <path d="M12 6.5h2v7h-7v-2" />
  </Icon>
)
