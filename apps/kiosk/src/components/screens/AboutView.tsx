import { ChevronLeft } from "lucide-react";

interface AboutViewProps {
  venueName: string;
  hours: string;
  address: string;
  chefName: string;
  chefNote: string;
  onBack: () => void;
}

// Screen 16 — Venue / About. Presentational: every value arrives as a prop
// (venueName/hours/chefName/chefNote from restaurant config via Index.tsx,
// address as a literal constant there). A row with an empty value is not
// rendered, so a restaurant that hasn't filled a config key degrades cleanly.
const AboutView = ({ venueName, hours, address, chefName, chefNote, onBack }: AboutViewProps) => (
  <div className="tt-about">
    <button type="button" className="tt-about-back" onClick={onBack}>
      <ChevronLeft size={20} aria-hidden="true" />
      Back
    </button>

    <h1 className="tt-about-name">{venueName}</h1>

    {hours && (
      <section className="tt-about-row">
        <p className="tt-about-label">Hours</p>
        <p className="tt-about-value">{hours}</p>
      </section>
    )}

    {address && (
      <section className="tt-about-row">
        <p className="tt-about-label">Find us</p>
        <p className="tt-about-value">{address}</p>
      </section>
    )}

    {chefNote && (
      <section className="tt-about-row">
        <p className="tt-about-label">
          From the kitchen{chefName ? ` — ${chefName}` : ""}
        </p>
        <p className="tt-about-value">{chefNote}</p>
      </section>
    )}
  </div>
);

export default AboutView;
