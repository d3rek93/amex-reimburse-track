export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_snapshots: {
        Row: {
          amex_last_debit_date: string | null
          balance_eur: number
          created_at: string
          id: string
          pending_card_eur: number
          snapshot_date: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amex_last_debit_date?: string | null
          balance_eur: number
          created_at?: string
          id?: string
          pending_card_eur?: number
          snapshot_date: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amex_last_debit_date?: string | null
          balance_eur?: number
          created_at?: string
          id?: string
          pending_card_eur?: number
          snapshot_date?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      balance_references: {
        Row: {
          amount_eur: number
          created_at: string
          id: string
          reference_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_eur: number
          created_at?: string
          id?: string
          reference_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_eur?: number
          created_at?: string
          id?: string
          reference_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_sessions: {
        Row: {
          accounts: Json
          aspsp_name: string | null
          country: string | null
          created_at: string
          id: string
          last_synced_at: string | null
          session_id: string
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          accounts?: Json
          aspsp_name?: string | null
          country?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          session_id: string
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          accounts?: Json
          aspsp_name?: string | null
          country?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          session_id?: string
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      claim_batches: {
        Row: {
          created_at: string
          declared_total: number
          id: string
          payment_date: string
          ref: string
          user_id: string
        }
        Insert: {
          created_at?: string
          declared_total: number
          id?: string
          payment_date: string
          ref: string
          user_id: string
        }
        Update: {
          created_at?: string
          declared_total?: number
          id?: string
          payment_date?: string
          ref?: string
          user_id?: string
        }
        Relationships: []
      }
      claim_lines: {
        Row: {
          amount_eur: number
          batch_ref: string
          category: string
          created_at: string
          id: string
          line_date: string
          note_id: string
          payment_date: string
          subcategory: string
          user_id: string
        }
        Insert: {
          amount_eur: number
          batch_ref: string
          category?: string
          created_at?: string
          id?: string
          line_date: string
          note_id: string
          payment_date: string
          subcategory?: string
          user_id: string
        }
        Update: {
          amount_eur?: number
          batch_ref?: string
          category?: string
          created_at?: string
          id?: string
          line_date?: string
          note_id?: string
          payment_date?: string
          subcategory?: string
          user_id?: string
        }
        Relationships: []
      }
      jetfly_transfers: {
        Row: {
          amount_eur: number
          bank_transaction_id: string
          created_at: string
          date: string
          id: string
          label: string
          user_id: string
        }
        Insert: {
          amount_eur: number
          bank_transaction_id: string
          created_at?: string
          date: string
          id?: string
          label?: string
          user_id: string
        }
        Update: {
          amount_eur?: number
          bank_transaction_id?: string
          created_at?: string
          date?: string
          id?: string
          label?: string
          user_id?: string
        }
        Relationships: []
      }
      reconciliation_links: {
        Row: {
          comment: string | null
          created_at: string
          difference: number
          expense_ids: string[]
          id: string
          note_ids: string[]
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          difference?: number
          expense_ids?: string[]
          id?: string
          note_ids?: string[]
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          difference?: number
          expense_ids?: string[]
          id?: string
          note_ids?: string[]
          user_id?: string
        }
        Relationships: []
      }
      reconciliation_rejections: {
        Row: {
          created_at: string
          expense_id: string
          id: string
          note_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          id?: string
          note_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          id?: string
          note_id?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount_eur: number
          considered_complete: boolean
          bank_transaction_id: string | null
          conversion_fees: number | null
          created_at: string
          date: string
          description: string
          expense_number: string[] | null
          id: string
          is_personal: boolean
          original_amount: number | null
          original_currency: string | null
          reimbursed_amount: number
          reimbursement_status: string
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_eur: number
          considered_complete?: boolean
          bank_transaction_id?: string | null
          conversion_fees?: number | null
          created_at?: string
          date: string
          description: string
          expense_number?: string[] | null
          id?: string
          is_personal?: boolean
          original_amount?: number | null
          original_currency?: string | null
          reimbursed_amount?: number
          reimbursement_status?: string
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_eur?: number
          considered_complete?: boolean
          bank_transaction_id?: string | null
          conversion_fees?: number | null
          created_at?: string
          date?: string
          description?: string
          expense_number?: string[] | null
          id?: string
          is_personal?: boolean
          original_amount?: number | null
          original_currency?: string | null
          reimbursed_amount?: number
          reimbursement_status?: string
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      manual_transfers: {
        Row: {
          amount_eur: number
          created_at: string
          description: string | null
          id: string
          transfer_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_eur: number
          created_at?: string
          description?: string | null
          id?: string
          transfer_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_eur?: number
          created_at?: string
          description?: string | null
          id?: string
          transfer_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reimbursements: {
        Row: {
          amount_eur: number
          category: string
          created_at: string
          discrepancy_approved: boolean
          expense_date: string
          expense_number: string
          id: string
          matched_expense_id: string | null
          payment_date: string
          payment_reference: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_eur: number
          category: string
          created_at?: string
          discrepancy_approved?: boolean
          expense_date: string
          expense_number: string
          id?: string
          matched_expense_id?: string | null
          payment_date: string
          payment_reference: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_eur?: number
          category?: string
          created_at?: string
          discrepancy_approved?: boolean
          expense_date?: string
          expense_number?: string
          id?: string
          matched_expense_id?: string | null
          payment_date?: string
          payment_reference?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
