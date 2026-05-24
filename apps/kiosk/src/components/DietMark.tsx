interface DietMarkProps {
  isVeg: boolean;
  label?: boolean;
  compact?: boolean;
}

export default function DietMark({ isVeg, label = false, compact = false }: DietMarkProps) {
  const text = isVeg ? "Veg" : "Non-Veg";

  return (
    <span
      className={`diet-mark${isVeg ? " veg" : " non-veg"}${label ? " with-label" : ""}${compact ? " compact" : ""}`}
      aria-label={text}
      title={text}
    >
      <span className="diet-mark-box" aria-hidden="true">
        <span />
      </span>
      {label && <span className="diet-mark-text">{text}</span>}
    </span>
  );
}
