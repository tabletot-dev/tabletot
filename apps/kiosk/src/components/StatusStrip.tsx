interface StatusStripProps {
  label: string;
  detail: string;
  onTap?: () => void;
}

// The docked strip that keeps a live round (or a counting-down held round)
// visible from every screen — including the games. A guest who wanders off
// the status screen must never lose sight of what the kitchen is doing.
export default function StatusStrip({ label, detail, onTap }: StatusStripProps) {
  const Tag = onTap ? "button" : "div";
  return (
    <Tag
      className="tt-statusstrip"
      {...(onTap ? { type: "button" as const, onClick: onTap } : {})}
    >
      <span className="tt-statusstrip-label">{label}</span>
      <span className="tt-statusstrip-detail">{detail}</span>
    </Tag>
  );
}
