interface PrimeColorSwatchProps {
  hex: string;
  size?: number;
  label?: string;
}

export function PrimeColorSwatch({
  hex,
  size = 14,
  label,
}: PrimeColorSwatchProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className="shrink-0"
      aria-label={label ?? `Color ${hex}`}
      role="img"
    >
      <rect
        x="0.5"
        y="0.5"
        width="15"
        height="15"
        rx="3"
        fill={hex}
        stroke="#CBD5E1"
        strokeWidth="1"
      />
    </svg>
  );
}
