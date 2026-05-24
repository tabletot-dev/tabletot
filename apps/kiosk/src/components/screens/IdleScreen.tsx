import TabletotLogo from "@/components/TabletotLogo";

const IdleScreen = ({ onActivate }: { onActivate: () => void }) => {
  return (
    <button className="idle-attract-screen" onClick={onActivate} aria-label="Touch anywhere to continue">
      <TabletotLogo className="idle-tabletot-logo" />
      <div className="idle-attract-lockup" aria-hidden="true">
        <strong>SILVER</strong>
        <span>SPECIALTY COFFEE</span>
      </div>
      <p>Touch anywhere to continue</p>
    </button>
  );
};

export default IdleScreen;
