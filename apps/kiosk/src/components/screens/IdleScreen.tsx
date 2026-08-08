import TabletotLogo from "@/components/TabletotLogo";
import { useRestaurant } from "@/lib/restaurantContext";

const IdleScreen = ({ onActivate }: { onActivate: () => void }) => {
  const { venueName } = useRestaurant();

  return (
    <button className="tt-attract" onClick={onActivate} aria-label="Touch anywhere to continue">
      <TabletotLogo className="tt-attract-logo" />
      <p className="tt-attract-venue">{venueName || "Tabletot"}</p>
      <p className="tt-attract-prompt">Touch anywhere to continue</p>
    </button>
  );
};

export default IdleScreen;
