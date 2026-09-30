import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const restaurant = vi.hoisted(() => ({ wifiSsid: "SILVER-GUEST", wifiPassword: "" }));
vi.mock("@/lib/restaurantContext", () => ({ useRestaurant: () => restaurant }));

import WifiDialog from "@/components/WifiDialog";

beforeEach(() => {
  restaurant.wifiSsid = "SILVER-GUEST";
  restaurant.wifiPassword = "";
});

describe("WifiDialog", () => {
  it("renders nothing while closed", () => {
    render(<WifiDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the heading and open-network instruction, and Close calls onOpenChange(false)", () => {
    const onOpenChange = vi.fn();
    render(<WifiDialog open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Join the café Wi-Fi");
    expect(dialog).toHaveTextContent(/network is open, no\s+password needed/);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the configured network and password, and a generated QR", () => {
    restaurant.wifiSsid = "CAFE-WIFI";
    restaurant.wifiPassword = "beans123";
    render(<WifiDialog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Network: CAFE-WIFI");
    expect(dialog).toHaveTextContent("Password: beans123");
    expect(dialog).not.toHaveTextContent(/network is open/);
    expect(screen.getByRole("img", { name: "QR code to join the CAFE-WIFI Wi-Fi network" })).toBeInTheDocument();
  });
});
