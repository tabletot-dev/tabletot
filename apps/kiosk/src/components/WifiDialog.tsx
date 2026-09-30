import * as Dialog from "@radix-ui/react-dialog";
import { QRCodeSVG } from "qrcode.react";
import { useRestaurant } from "@/lib/restaurantContext";
import { wifiQrPayload } from "@/lib/wifi";

interface WifiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// One Wi-Fi dialog for the whole app — opened from the Attract screen and the
// app bar. Index.tsx owns `open` so it can also pause the ad screensaver while
// a guest is scanning the code.
export default function WifiDialog({ open, onOpenChange }: WifiDialogProps) {
  const { wifiSsid, wifiPassword } = useRestaurant();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="tt-modal-scrim" />
        <Dialog.Content className="tt-modal tt-wifi-dialog" aria-describedby={undefined}>
          <Dialog.Title>Join the café Wi-Fi</Dialog.Title>
          <QRCodeSVG
            className="tt-wifi-qr"
            value={wifiQrPayload(wifiSsid, wifiPassword)}
            size={220}
            role="img"
            aria-label={`QR code to join the ${wifiSsid} Wi-Fi network`}
          />
          <p>
            {wifiPassword
              ? "Point your phone camera at the code to join."
              : "Point your phone camera at the code — the network is open, no password needed."}
          </p>
          <p className="tt-wifi-network">Network: {wifiSsid}</p>
          {wifiPassword && <p className="tt-wifi-network">Password: {wifiPassword}</p>}
          <div className="tt-modal-actions">
            <Dialog.Close asChild>
              <button type="button" className="tt-btn--secondary">
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
