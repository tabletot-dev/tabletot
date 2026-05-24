import { useEffect } from "react";
import TabletotLogo from "@/components/TabletotLogo";

interface ConfirmationViewProps {
  onReset: () => void;
}

export default function ConfirmationView({ onReset }: ConfirmationViewProps) {
  useEffect(() => {
    const id = setTimeout(onReset, 5000);
    return () => clearTimeout(id);
  }, [onReset]);

  return (
    <section className="view confirmation-view">
      <div className="confirmation-panel">
        <div className="confirmation-logo-stage">
          <TabletotLogo className="confirmation-boot-mark" />
        </div>
        <p className="eyebrow">Order confirmed</p>
        <h1>Order sent to the kitchen.</h1>
        <p className="hero-sub">
          Your order has been placed successfully. This screen will switch to your table display in
          5 seconds.
        </p>
      </div>
    </section>
  );
}
