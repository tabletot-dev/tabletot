export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      anchor_items: {
        Row: {
          active: boolean | null
          active_window: Json | null
          anchor_type: string | null
          created_at: string | null
          id: string
          item_id: string | null
          priority: number | null
          restaurant_id: string | null
        }
        Insert: {
          active?: boolean | null
          active_window?: Json | null
          anchor_type?: string | null
          created_at?: string | null
          id?: string
          item_id?: string | null
          priority?: number | null
          restaurant_id?: string | null
        }
        Update: {
          active?: boolean | null
          active_window?: Json | null
          anchor_type?: string | null
          created_at?: string | null
          id?: string
          item_id?: string | null
          priority?: number | null
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anchor_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anchor_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      bill_requests: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          phone: string | null
          status: string
          table_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          phone?: string | null
          status?: string
          table_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          phone?: string | null
          status?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_requests_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_types: {
        Row: {
          coupon_code: string | null
          created_at: string
          discount_type: string
          id: string
          is_active: boolean
          max_discount: number | null
          min_order_value: number
          name: string
          valid_until: string | null
          value: number
        }
        Insert: {
          coupon_code?: string | null
          created_at?: string
          discount_type: string
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_value?: number
          name: string
          valid_until?: string | null
          value: number
        }
        Update: {
          coupon_code?: string | null
          created_at?: string
          discount_type?: string
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_value?: number
          name?: string
          valid_until?: string | null
          value?: number
        }
        Relationships: []
      }
      external_id_mapping: {
        Row: {
          created_at: string
          external_id: string
          id: string
          internal_item_id: string
          provider: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          internal_item_id: string
          provider: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          internal_item_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_id_mapping_internal_item_id_fkey"
            columns: ["internal_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_addons: {
        Row: {
          addon_name: string
          created_at: string
          id: string
          is_available: boolean
          menu_item_id: string
          price: number
        }
        Insert: {
          addon_name: string
          created_at?: string
          id?: string
          is_available?: boolean
          menu_item_id: string
          price?: number
        }
        Update: {
          addon_name?: string
          created_at?: string
          id?: string
          is_available?: boolean
          menu_item_id?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_addons_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_pairings: {
        Row: {
          context: string | null
          created_at: string | null
          id: string
          paired_item_id: string | null
          priority: number | null
          restaurant_id: string | null
          source_item_id: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          id?: string
          paired_item_id?: string | null
          priority?: number | null
          restaurant_id?: string | null
          source_item_id?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string | null
          id?: string
          paired_item_id?: string | null
          priority?: number | null
          restaurant_id?: string | null
          source_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_pairings_paired_item_id_fkey"
            columns: ["paired_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_pairings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_pairings_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_variants: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          menu_item_id: string
          price_modifier: number
          variant_name: string
          variant_type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          menu_item_id: string
          price_modifier?: number
          variant_name: string
          variant_type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          menu_item_id?: string
          price_modifier?: number
          variant_name?: string
          variant_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_variants_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      kot_tickets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items: Json | null
          kot_number: string | null
          order_id: string | null
          printed_at: string
          restaurant_id: string | null
          session_id: string | null
          special_notes: string | null
          status: string
          table_number: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json | null
          kot_number?: string | null
          order_id?: string | null
          printed_at?: string
          restaurant_id?: string | null
          session_id?: string | null
          special_notes?: string | null
          status?: string
          table_number?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json | null
          kot_number?: string | null
          order_id?: string | null
          printed_at?: string
          restaurant_id?: string | null
          session_id?: string | null
          special_notes?: string | null
          status?: string
          table_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kot_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kot_tickets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_completion_rules: {
        Row: {
          active: boolean | null
          condition: Json | null
          created_at: string | null
          id: string
          priority: number | null
          restaurant_id: string | null
          rule_name: string
          suggestion: Json | null
        }
        Insert: {
          active?: boolean | null
          condition?: Json | null
          created_at?: string | null
          id?: string
          priority?: number | null
          restaurant_id?: string | null
          rule_name: string
          suggestion?: Json | null
        }
        Update: {
          active?: boolean | null
          condition?: Json | null
          created_at?: string | null
          id?: string
          priority?: number | null
          restaurant_id?: string | null
          rule_name?: string
          suggestion?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_completion_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      menu_item_aliases: {
        Row: {
          alias: string
          created_at: string | null
          id: string
          item_id: string | null
          restaurant_id: string | null
        }
        Insert: {
          alias: string
          created_at?: string | null
          id?: string
          item_id?: string | null
          restaurant_id?: string | null
        }
        Update: {
          alias?: string
          created_at?: string | null
          id?: string
          item_id?: string | null
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_aliases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_aliases_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          id: string
          image_url: string | null
          is_veg: boolean
          name: string
          price: number | null
          restaurant_id: string | null
          tags: Json | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_veg?: boolean
          name: string
          price?: number | null
          restaurant_id?: string | null
          tags?: Json | null
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_veg?: boolean
          name?: string
          price?: number | null
          restaurant_id?: string | null
          tags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_history: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          customer_name: string | null
          discount: number
          id: string
          items_json: Json | null
          order_created_at: string | null
          order_id: string | null
          order_type: string | null
          original_order_id: string | null
          payment_method: string | null
          source: string | null
          special_instructions: string | null
          subtotal: number
          table_no: string | null
          tax: number
          tips: number
          total: number
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          items_json?: Json | null
          order_created_at?: string | null
          order_id?: string | null
          order_type?: string | null
          original_order_id?: string | null
          payment_method?: string | null
          source?: string | null
          special_instructions?: string | null
          subtotal?: number
          table_no?: string | null
          tax?: number
          tips?: number
          total?: number
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          items_json?: Json | null
          order_created_at?: string | null
          order_id?: string | null
          order_type?: string | null
          original_order_id?: string | null
          payment_method?: string | null
          source?: string | null
          special_instructions?: string | null
          subtotal?: number
          table_no?: string | null
          tax?: number
          tips?: number
          total?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          item_name: string | null
          line_total: number
          order_id: string | null
          qty: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string | null
          line_total?: number
          order_id?: string | null
          qty?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string | null
          line_total?: number
          order_id?: string | null
          qty?: number
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string | null
          discount: number
          id: string
          items_json: Json | null
          order_id: string | null
          order_type: string | null
          restaurant_id: string | null
          session_id: string | null
          source: string | null
          special_instructions: string | null
          status: string
          subtotal: number
          table_id: string | null
          table_no: string | null
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          items_json?: Json | null
          order_id?: string | null
          order_type?: string | null
          restaurant_id?: string | null
          session_id?: string | null
          source?: string | null
          special_instructions?: string | null
          status?: string
          subtotal?: number
          table_id?: string | null
          table_no?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          items_json?: Json | null
          order_id?: string | null
          order_type?: string | null
          restaurant_id?: string | null
          session_id?: string | null
          source?: string | null
          special_instructions?: string | null
          status?: string
          subtotal?: number
          table_id?: string | null
          table_no?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          order_id: string | null
          payment_method: string | null
          status: string
          tips: number
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          payment_method?: string | null
          status?: string
          tips?: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          payment_method?: string | null
          status?: string
          tips?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      recommendation_events: {
        Row: {
          cart_value_at_show: number | null
          id: string
          item_accepted: boolean | null
          item_shown: string | null
          pattern_type: string | null
          restaurant_id: string | null
          session_id: string | null
          table_id: string | null
          timestamp: string | null
        }
        Insert: {
          cart_value_at_show?: number | null
          id?: string
          item_accepted?: boolean | null
          item_shown?: string | null
          pattern_type?: string | null
          restaurant_id?: string | null
          session_id?: string | null
          table_id?: string | null
          timestamp?: string | null
        }
        Update: {
          cart_value_at_show?: number | null
          id?: string
          item_accepted?: boolean | null
          item_shown?: string | null
          pattern_type?: string | null
          restaurant_id?: string | null
          session_id?: string | null
          table_id?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_events_item_shown_fkey"
            columns: ["item_shown"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          restaurant_id: string | null
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          restaurant_id?: string | null
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          restaurant_id?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          area_id: string | null
          assigned_captain: string | null
          capacity: number | null
          created_at: string
          current_order_id: string | null
          id: string
          is_treatment: boolean
          restaurant_id: string | null
          status: string
          table_number: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          assigned_captain?: string | null
          capacity?: number | null
          created_at?: string
          current_order_id?: string | null
          id?: string
          is_treatment?: boolean
          restaurant_id?: string | null
          status?: string
          table_number: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          assigned_captain?: string | null
          capacity?: number | null
          created_at?: string
          current_order_id?: string | null
          id?: string
          is_treatment?: boolean
          restaurant_id?: string | null
          status?: string
          table_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_restaurant_tables_current_order"
            columns: ["current_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          name: string
          pos_provider: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          id?: string
          name: string
          pos_provider?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          name?: string
          pos_provider?: string | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          bill_requested_by: string | null
          ended_at: string | null
          id: string
          restaurant_id: string | null
          session_key: string
          started_at: string
          status: string
          table_id: string
          table_number: string
        }
        Insert: {
          bill_requested_by?: string | null
          ended_at?: string | null
          id?: string
          restaurant_id?: string | null
          session_key: string
          started_at?: string
          status?: string
          table_id: string
          table_number: string
        }
        Update: {
          bill_requested_by?: string | null
          ended_at?: string | null
          id?: string
          restaurant_id?: string | null
          session_key?: string
          started_at?: string
          status?: string
          table_id?: string
          table_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      table_requests: {
        Row: {
          created_at: string
          id: string
          request_type: string
          status: string
          table_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_type: string
          status?: string
          table_id: string
        }
        Update: {
          created_at?: string
          id?: string
          request_type?: string
          status?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_requests_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_turns: {
        Row: {
          created_at: string
          id: string
          resolved_items: Json | null
          restaurant_id: string | null
          session_key: string | null
          table_number: string | null
          unresolved_phrases: string[] | null
        }
        Insert: {
          created_at?: string
          id?: string
          resolved_items?: Json | null
          restaurant_id?: string | null
          session_key?: string | null
          table_number?: string | null
          unresolved_phrases?: string[] | null
        }
        Update: {
          created_at?: string
          id?: string
          resolved_items?: Json | null
          restaurant_id?: string | null
          session_key?: string | null
          table_number?: string | null
          unresolved_phrases?: string[] | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recommendation_aov_lift_cohort: {
        Args: { p_end_at: string; p_restaurant_id: string; p_start_at: string }
        Returns: {
          control_avg_total: number
          control_n: number
          control_stddev: number
          delta: number
          p_value: number
          t_stat: number
          treatment_avg_total: number
          treatment_n: number
          treatment_stddev: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

