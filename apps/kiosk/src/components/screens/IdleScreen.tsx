import { Mic } from "lucide-react";
import TabletotLogo from "@/components/TabletotLogo";

interface IdleScreenProps {
  onActivate: () => void;
  tableId?: string;
  onInfoToast?: (message: string) => void;
}

const IdleScreen = ({ onActivate, tableId, onInfoToast }: IdleScreenProps) => {
  const activate = () => onActivate();

  return (
    <div
      className="tt-attract"
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && activate()}
      aria-label="Touch anywhere to start"
    >
      <div className="tt-attract-header">
        <div className="tt-attract-brand">
          <TabletotLogo className="tt-attract-icon" />
          <div>
            <p className="tt-attract-brand-name">Tabletot</p>
            <p className="tt-attract-brand-tag">Table Service</p>
          </div>
        </div>
        {tableId && <span className="tt-badge">Table {tableId}</span>}
      </div>

      <div className="tt-attract-title">
        <p className="tt-attract-title-word">Silver</p>
        <p className="tt-attract-title-sub">Specialty Coffee</p>
        <div className="tt-attract-rule" />
        <p className="tt-attract-tagline">
          Your table waiter. Browse the menu, or just ask out loud.
        </p>
      </div>

      <div className="tt-attract-cta">
        <span className="tt-attract-cta-icon">
          <Mic size={20} />
        </span>
        <span className="tt-attract-cta-text">
          <strong>Touch anywhere to start</strong>
          <span>or say "Hey Tabletot, I'm hungry"</span>
        </span>
      </div>

      <div className="tt-attract-footer">
        <button
          type="button"
          className="tt-attract-about"
          onClick={(e) => {
            e.stopPropagation();
            onInfoToast?.("Ask the team for today's story and chef's note.");
          }}
        >
          About Silver — chef's note, our story →
        </button>
        <p className="tt-attract-wifi">Wi-Fi: SILVER-GUEST</p>
      </div>
    </div>
  );
};

export default IdleScreen;
