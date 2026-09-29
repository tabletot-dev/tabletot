/** Non-blocking "food is ready" banner shown above any while-you-wait screen. */
export default function ReadyBanner({ onSeeOrder }: { onSeeOrder: () => void }) {
  return (
    <button type="button" className="tt-gm-ready" onClick={onSeeOrder}>
      <span>
        <strong>Your food is ready</strong>
        <small>A server is bringing it to your table</small>
      </span>
      <span className="tt-gm-ready-cta">See order</span>
    </button>
  );
}
