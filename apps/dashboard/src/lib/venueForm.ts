// Pure helpers for the Venue screen. No imports, so `pnpm test` runs them under node.

export type Config = Record<string, unknown>;

export interface VenueForm {
  hours: string;
  chef_name: string;
  chef_note: string;
  address: string;
  wifi_ssid: string;
  wifi_password: string;
  voice_enabled: boolean;
  prompt_for_identity: boolean;
}

const TEXT_KEYS = ['hours', 'chef_name', 'chef_note', 'address', 'wifi_ssid', 'wifi_password'] as const;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

// Kiosk defaults when a key is absent: voice on, name prompt off.
export function configToForm(c: Config | null): VenueForm {
  return {
    hours: str(c?.hours),
    chef_name: str(c?.chef_name),
    chef_note: str(c?.chef_note),
    address: str(c?.address),
    wifi_ssid: str(c?.wifi_ssid),
    wifi_password: str(c?.wifi_password),
    voice_enabled: c?.voice_enabled !== false,
    prompt_for_identity: c?.prompt_for_identity === true,
  };
}

// Starts from the stored config so keys this form doesn't know about survive
// a save. A blank text field removes its key, so the kiosk falls back to its
// default (address, Wi-Fi name) or hides the row (hours, chef).
export function formToConfig(base: Config | null, form: VenueForm): Config {
  const out: Config = { ...base };
  for (const k of TEXT_KEYS) {
    const v = k === 'wifi_password' ? form[k] : form[k].trim(); // a password may need its spaces
    if (v) out[k] = v;
    else delete out[k];
  }
  out.voice_enabled = form.voice_enabled;
  out.prompt_for_identity = form.prompt_for_identity;
  return out;
}

// GST percent: a number from 0 to 100, else null.
export function parseGst(s: string): number | null {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
