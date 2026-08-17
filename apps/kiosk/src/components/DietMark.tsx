interface DietMarkProps {
  isVeg: boolean;
  label?: boolean;
  compact?: boolean;
}

export default function DietMark({ isVeg, label = false, compact = false }: DietMarkProps) {
  const text = isVeg ? "Veg" : "Non-Veg";

  return (
    <span
      className={`tt-dietmark${isVeg ? " tt-dietmark--veg" : " tt-dietmark--nonveg"}${compact ? " tt-dietmark--compact" : ""}`}
      aria-label={text}
      title={text}
    >
      <span className="tt-dietmark-icon" aria-hidden="true">
        <span className="tt-dietmark-dot" />
      </span>
      {label && <span className="tt-dietmark-label">{text}</span>}
    </span>
  );
}
