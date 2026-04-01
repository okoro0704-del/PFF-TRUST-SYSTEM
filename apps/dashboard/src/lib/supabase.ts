import { createClient } from "@supabase/supabase-js";

// ─── Environment Variables ────────────────────────────────────────────────────
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/dashboard/.env
// These are PUBLIC keys — safe to expose in the browser.
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnon) {
  console.warn(
    "[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set. " +
    "Realtime subscriptions will not work. " +
    "Copy apps/dashboard/.env.example to apps/dashboard/.env and fill in your values.",
  );
}

// ─── Typed Database Schema ────────────────────────────────────────────────────
export type Database = {
  public: {
    Tables: {
      zfps_provisioning_event: {
        Row: {
          id:               string;
          session_ref:      string;
          bank_code:        string;
          bank_name:        string | null;
          account_type:     string;
          status:           string;
          cbs_latency_ms:   number | null;
          mandate_met:      boolean;
          sms_sent:         boolean;
          iso20022_msg_id:  string | null;
          account_number_masked: string | null;
          vault_mode:       string;
          org_id:           string;
          created_at:       string;
        };
      };
      bank_api_latency_log: {
        Row: {
          id:           string;
          bank_code:    string;
          bank_name:    string | null;
          session_ref:  string;
          latency_ms:   number;
          success:      boolean;
          alert_triggered: boolean;
          created_at:   string;
        };
      };
      sms_send_log: {
        Row: {
          id:               string;
          session_ref:      string;
          recipient_masked: string;
          bank_code:        string;
          message_preview:  string;
          provider:         string;
          status:           string;
          error_message:    string | null;
          created_at:       string;
        };
      };
      bank_license: {
        Row: {
          id:               string;
          bank_code:        string;
          bank_name:        string;
          status:           string;
          license_start_at: string | null;
          license_end_at:   string | null;
          switching_toll_ngn: number;
          created_at:       string;
          updated_at:       string;
        };
      };
      admin_red_flag: {
        Row: {
          id:          string;
          severity:    string;
          category:    string;
          title:       string;
          description: string;
          resolved:    boolean;
          created_at:  string;
        };
      };
    };
  };
};

// ─── Singleton Client ─────────────────────────────────────────────────────────
export const supabase = (supabaseUrl && supabaseAnon)
  ? createClient<Database>(supabaseUrl, supabaseAnon, {
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

/** Convenience: check if Supabase is configured before using realtime. */
export const isSupabaseReady = () => supabase !== null;

