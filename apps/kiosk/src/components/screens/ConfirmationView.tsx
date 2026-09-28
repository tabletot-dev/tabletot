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
    <section className="tt-confirmation">
      <TabletotLogo className="tt-confirmation-logo" />
      <p className="eyebrow">Order confirmed</p>
      <h1>Order sent to the kitchen.</h1>
      <p className="tt-confirmation-sub">
        Your order has been placed successfully. This screen will switch to your table display in
        5 seconds.
      </p>
    </section>
  );
}
