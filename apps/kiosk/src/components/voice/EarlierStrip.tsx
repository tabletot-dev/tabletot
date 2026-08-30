interface EarlierStripProps {
  turns: { role: "user" | "ai"; text: string }[];
  tone?: "light" | "dark";
  onExpand: () => void;
}

const truncate = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function EarlierStrip({ turns, tone = "light", onExpand }: EarlierStripProps) {
  if (turns.length === 0) return null;
  const firstUser = turns.find((t) => t.role === "user")?.text ?? turns[0].text;
  const more = Math.max(0, turns.length - 1);
  return (
    <button type="button" className={`tt-voice-earlier tt-voice-earlier--${tone}`} onClick={onExpand}>
      <span className="tt-voice-earlier-label">Earlier</span>
      <span className="tt-voice-earlier-text">"{truncate(firstUser)}"</span>
      {more > 0 && <span className="tt-voice-earlier-more">· {more} more</span>}
    </button>
  );
}
