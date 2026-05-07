const ListeningScreen = ({ onDone }: { onDone: () => void }) => {
  return (
    <>
      <div className="voice-sheet-backdrop" onClick={onDone} />
      <section className="voice-sheet" aria-label="Voice assistant">
        <div className="voice-sheet-handle" />
        <div className="voice-sheet-top">
          <div className="voice-active-mark">
            <div className="voice-orb">
              <div className="voice-ring" />
              <div className="voice-ring voice-ring-b" />
              <svg
                className="mic-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="var(--brand)"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M6 11a6 6 0 0 0 12 0" />
                <path d="M12 17v4" />
                <path d="M9 21h6" />
              </svg>
            </div>
            <div className="voice-sheet-copy">
              <p className="eyebrow">Listening</p>
              <h2>What would you like?</h2>
            </div>
          </div>
          <button className="voice-close" onClick={onDone} aria-label="Close voice assistant">
            Done
          </button>
        </div>

        <div className="voice-wave">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {['"Order a burger"', '"Show desserts"', '"Add fries"'].map((cmd) => (
            <span
              key={cmd}
              className="ghost-pill"
              style={{ fontSize: 14, minHeight: 42, padding: "0 16px" }}
            >
              {cmd}
            </span>
          ))}
        </div>
      </section>
    </>
  );
};

export default ListeningScreen;
