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
  primary: 'bg-accent text-on-accent shadow-accent hover:brightness-[1.08]',
  plain: 'glass-strong specular text-ink ring-1 ring-line shadow-tile hover:brightness-[1.04]',
  ghost: 'text-muted hover:bg-fill hover:text-ink',
}

/**
 * A rounded rectangle, not a capsule. The pill belongs to the landing page
 * above; inside the window this is a Mac push button, and a Mac push button is
 * 30 tall with about 7 of corner on it.
 */
export function Button({
  variant = 'plain',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-control shrink-0 items-center gap-1.5 rounded-inner px-3.5 text-body',
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
      className="relative grid max-w-full shrink-0 rounded-capsule bg-fill p-[2px]"
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

/**
 * A quality slider. Native <input type=range>, because dragging, arrow keys,
 * screen readers and the touch target are all already correct in one, and none
 * of them are free to rebuild.
 */
export function Slider({
  label,
  value,
  onChange,
  min = 1,
  max = 100,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cx(
          // 24 tall, which is the pointer target floor in WCAG 2.2 SC 2.5.8.
          // The rail keeps its 6px, painted on the track rather than on the box.
          'h-6 w-24 cursor-pointer appearance-none bg-transparent sm:w-32',
          '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-capsule',
          '[&::-webkit-slider-runnable-track]:bg-fill',
          '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-capsule [&::-moz-range-track]:bg-fill',
          // A webkit thumb sits on top of the track it is given; this centres it.
          '[&::-webkit-slider-thumb]:mt-[-4px]',
          '[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-thumb',
          '[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:border-0',
          '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent',
          'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink',
        )}
      />
      <span className="text-body w-7 shrink-0 text-right tabular-nums">{value}</span>
    </span>
  )
}

/**
 * An on/off control. A checkbox rather than a switch: the label is beside it
 * either way, and a checkbox is the one browsers already announce correctly.
 */
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="text-body flex min-h-6 cursor-pointer items-center gap-1.5 select-none touch:min-h-11">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--color-accent)]"
      />
      {label}
    </label>
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
 *
 * It wraps, so on a narrow bar the caption sits above the control it names
 * rather than beside it. Held on one line it was the last thing in the footer
 * that could not give way: a three-option segmented control with a word in
 * front of it is wider than a 320 screen, and the control ran off the edge.
 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-2">
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

/** The converter's mark: one picture turning into another. */
export const SwapIcon = ({ size = 40, stroke = 0.9 }: IconProps) => (
  <Icon size={size} stroke={stroke}>
    <rect x="1.5" y="3" width="8" height="7" rx="1.8" />
    <path d="M3 8.5 5 6.5l1.5 1.5" />
    <path d="M8 13h5.5M11.5 11 13.5 13l-2 2" />
  </Icon>
)

/** Compression: a page squeezed inwards from both sides. */
export const CompressIcon = ({ size = 40, stroke = 0.9 }: IconProps) => (
  <Icon size={size} stroke={stroke}>
    <rect x="3" y="2" width="10" height="12" rx="2" />
    <path d="M5.5 6.5h5M8 4.5v2M8 9.5v2M5.5 9.5h5" />
  </Icon>
)

/** A signature: a written stroke over the line it sits on. */
export const SignIcon = ({ size = 40, stroke = 0.9 }: IconProps) => (
  <Icon size={size} stroke={stroke}>
    <path d="M2.5 9.5c2-4 3-4.5 4-1s2 2 3-1 1.5-1 2 1" />
    <path d="M2.5 13h11" />
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

/** A page with its label peeled off: what the file says about itself, removed. */
export const TagIcon = ({ size = 40, stroke = 0.9 }: IconProps) => (
  <Icon size={size} stroke={stroke}>
    <path d="M3 2.5h6L13 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 2 13.5v-9.5A1.5 1.5 0 0 1 3 2.5Z" />
    <path d="M9 2.5v4h4" />
    <path d="m5.5 11.5 4-3M5.5 8.5l4 3" />
  </Icon>
)

/** A marker drawing a bar across a line: what redaction looks like. */
export const MarkerIcon = ({ size = 40, stroke = 0.9 }: IconProps) => (
  <Icon size={size} stroke={stroke}>
    <rect x="2" y="9.5" width="12" height="3.5" rx="1" />
    <path d="M4.5 9.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 11.5 5v4.5" />
    <path d="M6.5 3.5V2.5h3v1" />
  </Icon>
)
