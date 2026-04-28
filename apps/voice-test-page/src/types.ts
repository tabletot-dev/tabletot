export type ResolverCall =
  | {
      type: "match";
      raw: string;
      item: string;
      method: string;
      score: number;
      applied: boolean;
    }
  | {
      type: "needs_variant";
      raw: string;
      item: string;
      variants: string[];
    }
  | {
      type: "ambiguous";
      raw: string;
      candidates: string[];
    }
  | {
      type: "no_match";
      raw: string;
      suggestions: string[];
    }
  | {
      type: "unavailable";
      raw: string;
      item: string;
      reason: string;
    };

export interface OrderItem {
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  special_notes: string;
  modifiers: string[];
  category: string;
}

export interface OrderSnapshot {
  items: OrderItem[];
  total: number;
  item_count: number;
  status: string;
}

export interface DoneMessage {
  type: "done";
  transcript: string;
  response: string;
  resolver: ResolverCall[];
  order: OrderSnapshot;
}

export type SttMessage =
  | { type: "speech_start" }
  | { type: "speech_end" }
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | DoneMessage
  | { type: "no_speech" }
  | { type: "error"; message: string };

export type TtsMessage =
  | { type: "speech_complete" }
  | { type: "error"; message: string };
