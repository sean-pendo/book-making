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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_name: string
          account_type: string | null
          arr: number | null
          atr: number | null
          build_id: string | null
          calculated_arr: number | null
          calculated_atr: number | null
          cre_count: number | null
          cre_risk: boolean | null
          cre_status: string | null
          created_at: string | null
          employees: number | null
          enterprise_vs_commercial: string | null
          exclude_from_reassignment: boolean | null
          expansion_score: number | null
          expansion_tier: string | null
          geo: string | null
          has_customer_hierarchy: boolean | null
          has_split_ownership: boolean | null
          hierarchy_bookings_arr_converted: number | null
          hq_country: string | null
          id: string
          idr_count: number | null
          in_customer_hierarchy: boolean | null
          inbound_count: number | null
          include_in_emea: boolean | null
          industry: string | null
          initial_sale_score: number | null
          initial_sale_tier: string | null
          is_2_0: boolean | null
          is_customer: boolean | null
          is_parent: boolean | null
          new_owner_id: string | null
          new_owner_name: string | null
          open_atr_count: number | null
          owner_id: string | null
          owner_name: string | null
          owners_lifetime_count: number | null
          parent_id: string | null
          previous_owner_id: string | null
          previous_parent_id: string | null
          renewal_date: string | null
          renewal_quarter: string | null
          risk_flag: boolean | null
          sales_territory: string | null
          sfdc_account_id: string
          ultimate_parent_employee_size: number | null
          ultimate_parent_id: string | null
          ultimate_parent_name: string | null
        }
        Insert: {
          account_name: string
          account_type?: string | null
          arr?: number | null
          atr?: number | null
          build_id?: string | null
          calculated_arr?: number | null
          calculated_atr?: number | null
          cre_count?: number | null
          cre_risk?: boolean | null
          cre_status?: string | null
          created_at?: string | null
          employees?: number | null
          enterprise_vs_commercial?: string | null
          exclude_from_reassignment?: boolean | null
          expansion_score?: number | null
          expansion_tier?: string | null
          geo?: string | null
          has_customer_hierarchy?: boolean | null
          has_split_ownership?: boolean | null
          hierarchy_bookings_arr_converted?: number | null
          hq_country?: string | null
          id?: string
          idr_count?: number | null
          in_customer_hierarchy?: boolean | null
          inbound_count?: number | null
          include_in_emea?: boolean | null
          industry?: string | null
          initial_sale_score?: number | null
          initial_sale_tier?: string | null
          is_2_0?: boolean | null
          is_customer?: boolean | null
          is_parent?: boolean | null
          new_owner_id?: string | null
          new_owner_name?: string | null
          open_atr_count?: number | null
          owner_id?: string | null
          owner_name?: string | null
          owners_lifetime_count?: number | null
          parent_id?: string | null
          previous_owner_id?: string | null
          previous_parent_id?: string | null
          renewal_date?: string | null
          renewal_quarter?: string | null
          risk_flag?: boolean | null
          sales_territory?: string | null
          sfdc_account_id: string
          ultimate_parent_employee_size?: number | null
          ultimate_parent_id?: string | null
          ultimate_parent_name?: string | null
        }
        Update: {
          account_name?: string
          account_type?: string | null
          arr?: number | null
          atr?: number | null
          build_id?: string | null
          calculated_arr?: number | null
          calculated_atr?: number | null
          cre_count?: number | null
          cre_risk?: boolean | null
          cre_status?: string | null
          created_at?: string | null
          employees?: number | null
          enterprise_vs_commercial?: string | null
          exclude_from_reassignment?: boolean | null
          expansion_score?: number | null
          expansion_tier?: string | null
          geo?: string | null
          has_customer_hierarchy?: boolean | null
          has_split_ownership?: boolean | null
          hierarchy_bookings_arr_converted?: number | null
          hq_country?: string | null
          id?: string
          idr_count?: number | null
          in_customer_hierarchy?: boolean | null
          inbound_count?: number | null
          include_in_emea?: boolean | null
          industry?: string | null
          initial_sale_score?: number | null
          initial_sale_tier?: string | null
          is_2_0?: boolean | null
          is_customer?: boolean | null
          is_parent?: boolean | null
          new_owner_id?: string | null
          new_owner_name?: string | null
          open_atr_count?: number | null
          owner_id?: string | null
          owner_name?: string | null
          owners_lifetime_count?: number | null
          parent_id?: string | null
          previous_owner_id?: string | null
          previous_parent_id?: string | null
          renewal_date?: string | null
          renewal_quarter?: string | null
          risk_flag?: boolean | null
          sales_territory?: string | null
          sfdc_account_id?: string
          ultimate_parent_employee_size?: number | null
          ultimate_parent_id?: string | null
          ultimate_parent_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_configuration: {
        Row: {
          account_scope: string | null
          assign_prospects: boolean | null
          atr_max: number | null
          atr_max_override: number | null
          atr_min: number | null
          atr_target: number | null
          atr_variance: number | null
          based_on_account_count: number | null
          based_on_rep_count: number | null
          build_id: string | null
          capacity_variance_percent: number | null
          continuity_days_threshold: number | null
          cre_max: number | null
          cre_max_override: number | null
          cre_min: number | null
          cre_target: number | null
          cre_variance: number | null
          created_at: string | null
          created_by: string | null
          customer_max_arr: number | null
          customer_min_arr: number | null
          customer_target_arr: number | null
          description: string
          field_conditions: Json | null
          final_distribution_strategy: string | null
          id: string
          intelligence_level: string | null
          last_calculated_at: string | null
          max_cre_per_rep: number | null
          max_tier1_per_rep: number | null
          max_tier2_per_rep: number | null
          prefer_continuity: boolean | null
          prefer_geographic_match: boolean | null
          prospect_max_arr: number | null
          prospect_min_arr: number | null
          prospect_target_arr: number | null
          q1_renewal_max: number | null
          q1_renewal_max_override: number | null
          q1_renewal_min: number | null
          q1_renewal_target: number | null
          q2_renewal_max: number | null
          q2_renewal_max_override: number | null
          q2_renewal_min: number | null
          q2_renewal_target: number | null
          q3_renewal_max: number | null
          q3_renewal_max_override: number | null
          q3_renewal_min: number | null
          q3_renewal_target: number | null
          q4_renewal_max: number | null
          q4_renewal_max_override: number | null
          q4_renewal_min: number | null
          q4_renewal_target: number | null
          renewal_concentration_max: number | null
          renewal_concentration_max_override: number | null
          rep_matching_rules: Json | null
          territory_mappings: Json | null
          tier1_max: number | null
          tier1_max_override: number | null
          tier1_min: number | null
          tier1_target: number | null
          tier1_variance: number | null
          tier2_max: number | null
          tier2_max_override: number | null
          tier2_min: number | null
          tier2_target: number | null
          tier2_variance: number | null
          updated_at: string | null
          use_ai_optimization: boolean | null
          value_mappings: Json | null
        }
        Insert: {
          account_scope?: string | null
          assign_prospects?: boolean | null
          atr_max?: number | null
          atr_max_override?: number | null
          atr_min?: number | null
          atr_target?: number | null
          atr_variance?: number | null
          based_on_account_count?: number | null
          based_on_rep_count?: number | null
          build_id?: string | null
          capacity_variance_percent?: number | null
          continuity_days_threshold?: number | null
          cre_max?: number | null
          cre_max_override?: number | null
          cre_min?: number | null
          cre_target?: number | null
          cre_variance?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_max_arr?: number | null
          customer_min_arr?: number | null
          customer_target_arr?: number | null
          description?: string
          field_conditions?: Json | null
          final_distribution_strategy?: string | null
          id?: string
          intelligence_level?: string | null
          last_calculated_at?: string | null
          max_cre_per_rep?: number | null
          max_tier1_per_rep?: number | null
          max_tier2_per_rep?: number | null
          prefer_continuity?: boolean | null
          prefer_geographic_match?: boolean | null
          prospect_max_arr?: number | null
          prospect_min_arr?: number | null
          prospect_target_arr?: number | null
          q1_renewal_max?: number | null
          q1_renewal_max_override?: number | null
          q1_renewal_min?: number | null
          q1_renewal_target?: number | null
          q2_renewal_max?: number | null
          q2_renewal_max_override?: number | null
          q2_renewal_min?: number | null
          q2_renewal_target?: number | null
          q3_renewal_max?: number | null
          q3_renewal_max_override?: number | null
          q3_renewal_min?: number | null
          q3_renewal_target?: number | null
          q4_renewal_max?: number | null
          q4_renewal_max_override?: number | null
          q4_renewal_min?: number | null
          q4_renewal_target?: number | null
          renewal_concentration_max?: number | null
          renewal_concentration_max_override?: number | null
          rep_matching_rules?: Json | null
          territory_mappings?: Json | null
          tier1_max?: number | null
          tier1_max_override?: number | null
          tier1_min?: number | null
          tier1_target?: number | null
          tier1_variance?: number | null
          tier2_max?: number | null
          tier2_max_override?: number | null
          tier2_min?: number | null
          tier2_target?: number | null
          tier2_variance?: number | null
          updated_at?: string | null
          use_ai_optimization?: boolean | null
          value_mappings?: Json | null
        }
        Update: {
          account_scope?: string | null
          assign_prospects?: boolean | null
          atr_max?: number | null
          atr_max_override?: number | null
          atr_min?: number | null
          atr_target?: number | null
          atr_variance?: number | null
          based_on_account_count?: number | null
          based_on_rep_count?: number | null
          build_id?: string | null
          capacity_variance_percent?: number | null
          continuity_days_threshold?: number | null
          cre_max?: number | null
          cre_max_override?: number | null
          cre_min?: number | null
          cre_target?: number | null
          cre_variance?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_max_arr?: number | null
          customer_min_arr?: number | null
          customer_target_arr?: number | null
          description?: string
          field_conditions?: Json | null
          final_distribution_strategy?: string | null
          id?: string
          intelligence_level?: string | null
          last_calculated_at?: string | null
          max_cre_per_rep?: number | null
          max_tier1_per_rep?: number | null
          max_tier2_per_rep?: number | null
          prefer_continuity?: boolean | null
          prefer_geographic_match?: boolean | null
          prospect_max_arr?: number | null
          prospect_min_arr?: number | null
          prospect_target_arr?: number | null
          q1_renewal_max?: number | null
          q1_renewal_max_override?: number | null
          q1_renewal_min?: number | null
          q1_renewal_target?: number | null
          q2_renewal_max?: number | null
          q2_renewal_max_override?: number | null
          q2_renewal_min?: number | null
          q2_renewal_target?: number | null
          q3_renewal_max?: number | null
          q3_renewal_max_override?: number | null
          q3_renewal_min?: number | null
          q3_renewal_target?: number | null
          q4_renewal_max?: number | null
          q4_renewal_max_override?: number | null
          q4_renewal_min?: number | null
          q4_renewal_target?: number | null
          renewal_concentration_max?: number | null
          renewal_concentration_max_override?: number | null
          rep_matching_rules?: Json | null
          territory_mappings?: Json | null
          tier1_max?: number | null
          tier1_max_override?: number | null
          tier1_min?: number | null
          tier1_target?: number | null
          tier1_variance?: number | null
          tier2_max?: number | null
          tier2_max_override?: number | null
          tier2_min?: number | null
          tier2_target?: number | null
          tier2_variance?: number | null
          updated_at?: string | null
          use_ai_optimization?: boolean | null
          value_mappings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_configuration_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_rules: {
        Row: {
          account_scope: string
          behavior_class: string | null
          build_id: string | null
          conditional_modifiers: Json | null
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          is_custom_rule: boolean | null
          name: string
          priority: number
          region_capacity_config: Json | null
          rule_dependencies: Json | null
          rule_logic: Json | null
          rule_type: string
          scoring_weights: Json | null
          updated_at: string
        }
        Insert: {
          account_scope?: string
          behavior_class?: string | null
          build_id?: string | null
          conditional_modifiers?: Json | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          is_custom_rule?: boolean | null
          name: string
          priority: number
          region_capacity_config?: Json | null
          rule_dependencies?: Json | null
          rule_logic?: Json | null
          rule_type: string
          scoring_weights?: Json | null
          updated_at?: string
        }
        Update: {
          account_scope?: string
          behavior_class?: string | null
          build_id?: string | null
          conditional_modifiers?: Json | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          is_custom_rule?: boolean | null
          name?: string
          priority?: number
          region_capacity_config?: Json | null
          rule_dependencies?: Json | null
          rule_logic?: Json | null
          rule_type?: string
          scoring_weights?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_rules_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assignment_type: string | null
          build_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_approved: boolean | null
          proposed_owner_id: string | null
          proposed_owner_name: string | null
          proposed_team: string | null
          rationale: string | null
          sfdc_account_id: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assignment_type?: string | null
          build_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_approved?: boolean | null
          proposed_owner_id?: string | null
          proposed_owner_name?: string | null
          proposed_team?: string | null
          rationale?: string | null
          sfdc_account_id: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assignment_type?: string | null
          build_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_approved?: boolean | null
          proposed_owner_id?: string | null
          proposed_owner_name?: string | null
          proposed_team?: string | null
          rationale?: string | null
          sfdc_account_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string | null
          build_id: string | null
          created_at: string | null
          created_by: string
          id: string
          new_values: Json | null
          old_values: Json | null
          rationale: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action?: string | null
          build_id?: string | null
          created_at?: string | null
          created_by: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          rationale?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string | null
          build_id?: string | null
          created_at?: string | null
          created_by?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          rationale?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      balancing_metrics: {
        Row: {
          arr: number | null
          atr: number | null
          build_id: string | null
          cre_risk_count: number | null
          created_at: string | null
          customer_count: number | null
          id: string
          owner_name: string
          prospect_count: number | null
          region: string | null
          renewals_q1: number | null
          renewals_q2: number | null
          renewals_q3: number | null
          renewals_q4: number | null
          team: string | null
          tier1_count: number | null
          updated_at: string | null
        }
        Insert: {
          arr?: number | null
          atr?: number | null
          build_id?: string | null
          cre_risk_count?: number | null
          created_at?: string | null
          customer_count?: number | null
          id?: string
          owner_name: string
          prospect_count?: number | null
          region?: string | null
          renewals_q1?: number | null
          renewals_q2?: number | null
          renewals_q3?: number | null
          renewals_q4?: number | null
          team?: string | null
          tier1_count?: number | null
          updated_at?: string | null
        }
        Update: {
          arr?: number | null
          atr?: number | null
          build_id?: string | null
          cre_risk_count?: number | null
          created_at?: string | null
          customer_count?: number | null
          id?: string
          owner_name?: string
          prospect_count?: number | null
          region?: string | null
          renewals_q1?: number | null
          renewals_q2?: number | null
          renewals_q3?: number | null
          renewals_q4?: number | null
          team?: string | null
          tier1_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "balancing_metrics_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      builds: {
        Row: {
          apply_50k_rule: boolean | null
          created_at: string | null
          created_by: string
          description: string | null
          enterprise_threshold: number | null
          geo_emea_mappings: Json | null
          holdover_policy: Json | null
          id: string
          name: string
          owner_id: string | null
          region: string
          status: Database["public"]["Enums"]["build_status"] | null
          target_date: string | null
          updated_at: string | null
          version_tag: string | null
        }
        Insert: {
          apply_50k_rule?: boolean | null
          created_at?: string | null
          created_by: string
          description?: string | null
          enterprise_threshold?: number | null
          geo_emea_mappings?: Json | null
          holdover_policy?: Json | null
          id?: string
          name: string
          owner_id?: string | null
          region?: string
          status?: Database["public"]["Enums"]["build_status"] | null
          target_date?: string | null
          updated_at?: string | null
          version_tag?: string | null
        }
        Update: {
          apply_50k_rule?: boolean | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          enterprise_threshold?: number | null
          geo_emea_mappings?: Json | null
          holdover_policy?: Json | null
          id?: string
          name?: string
          owner_id?: string | null
          region?: string
          status?: Database["public"]["Enums"]["build_status"] | null
          target_date?: string | null
          updated_at?: string | null
          version_tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "builds_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clashes: {
        Row: {
          account_name: string | null
          amer_owner: string | null
          build_id: string | null
          created_at: string | null
          emea_owner: string | null
          id: string
          is_resolved: boolean | null
          proposed_resolution: string | null
          resolution_rationale: string | null
          resolved_at: string | null
          resolved_by: string | null
          sfdc_account_id: string
        }
        Insert: {
          account_name?: string | null
          amer_owner?: string | null
          build_id?: string | null
          created_at?: string | null
          emea_owner?: string | null
          id?: string
          is_resolved?: boolean | null
          proposed_resolution?: string | null
          resolution_rationale?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sfdc_account_id: string
        }
        Update: {
          account_name?: string | null
          amer_owner?: string | null
          build_id?: string | null
          created_at?: string | null
          emea_owner?: string | null
          id?: string
          is_resolved?: boolean | null
          proposed_resolution?: string | null
          resolution_rationale?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sfdc_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clashes_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      export_packages: {
        Row: {
          build_id: string | null
          file_path: string | null
          generated_at: string | null
          generated_by: string
          id: string
          package_type: string | null
        }
        Insert: {
          build_id?: string | null
          file_path?: string | null
          generated_at?: string | null
          generated_by: string
          id?: string
          package_type?: string | null
        }
        Update: {
          build_id?: string | null
          file_path?: string | null
          generated_at?: string | null
          generated_by?: string
          id?: string
          package_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_packages_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      import_metadata: {
        Row: {
          id: string
          build_id: string | null
          data_type: 'accounts' | 'opportunities' | 'sales_reps'
          import_status: 'pending' | 'mapped' | 'validated' | 'completed' | 'error'
          imported_at: string | null
          imported_by: string | null
          total_rows: number | null
          valid_rows: number | null
          error_count: number | null
          warning_count: number | null
          field_mappings: Json | null
          auto_mapping_summary: Json | null
          validation_summary: Json | null
          original_filename: string | null
          original_file_size: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          build_id?: string | null
          data_type: 'accounts' | 'opportunities' | 'sales_reps'
          import_status?: 'pending' | 'mapped' | 'validated' | 'completed' | 'error'
          imported_at?: string | null
          imported_by?: string | null
          total_rows?: number | null
          valid_rows?: number | null
          error_count?: number | null
          warning_count?: number | null
          field_mappings?: Json | null
          auto_mapping_summary?: Json | null
          validation_summary?: Json | null
          original_filename?: string | null
          original_file_size?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          build_id?: string | null
          data_type?: 'accounts' | 'opportunities' | 'sales_reps'
          import_status?: 'pending' | 'mapped' | 'validated' | 'completed' | 'error'
          imported_at?: string | null
          imported_by?: string | null
          total_rows?: number | null
          valid_rows?: number | null
          error_count?: number | null
          warning_count?: number | null
          field_mappings?: Json | null
          auto_mapping_summary?: Json | null
          validation_summary?: Json | null
          original_filename?: string | null
          original_file_size?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_metadata_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_notes: {
        Row: {
          build_id: string
          created_at: string
          id: string
          manager_user_id: string
          note_text: string
          sfdc_account_id: string
          updated_at: string
        }
        Insert: {
          build_id: string
          created_at?: string
          id?: string
          manager_user_id: string
          note_text: string
          sfdc_account_id: string
          updated_at?: string
        }
        Update: {
          build_id?: string
          created_at?: string
          id?: string
          manager_user_id?: string
          note_text?: string
          sfdc_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_notes_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_reassignments: {
        Row: {
          account_name: string
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          build_id: string
          capacity_warnings: Json | null
          created_at: string
          current_owner_id: string
          current_owner_name: string
          id: string
          manager_user_id: string
          proposed_owner_id: string
          proposed_owner_name: string
          rationale: string | null
          revops_approved_at: string | null
          revops_approved_by: string | null
          sfdc_account_id: string
          slm_approved_at: string | null
          slm_approved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_name: string
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          build_id: string
          capacity_warnings?: Json | null
          created_at?: string
          current_owner_id: string
          current_owner_name: string
          id?: string
          manager_user_id: string
          proposed_owner_id: string
          proposed_owner_name: string
          rationale?: string | null
          revops_approved_at?: string | null
          revops_approved_by?: string | null
          sfdc_account_id: string
          slm_approved_at?: string | null
          slm_approved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          build_id?: string
          capacity_warnings?: Json | null
          created_at?: string
          current_owner_id?: string
          current_owner_name?: string
          id?: string
          manager_user_id?: string
          proposed_owner_id?: string
          proposed_owner_name?: string
          rationale?: string | null
          revops_approved_at?: string | null
          revops_approved_by?: string | null
          sfdc_account_id?: string
          slm_approved_at?: string | null
          slm_approved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_reassignments_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_reviews: {
        Row: {
          build_id: string
          created_at: string
          id: string
          manager_level: string
          manager_name: string
          manager_user_id: string
          reviewed_at: string | null
          sent_at: string
          sent_by: string
          status: string
          updated_at: string
        }
        Insert: {
          build_id: string
          created_at?: string
          id?: string
          manager_level: string
          manager_name: string
          manager_user_id: string
          reviewed_at?: string | null
          sent_at?: string
          sent_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          build_id?: string
          created_at?: string
          id?: string
          manager_level?: string
          manager_name?: string
          manager_user_id?: string
          reviewed_at?: string | null
          sent_at?: string
          sent_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_reviews_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          build_id: string | null
          created_at: string | null
          created_by: string
          id: string
          note_text: string
          note_type: string | null
          sfdc_account_id: string
        }
        Insert: {
          build_id?: string | null
          created_at?: string | null
          created_by: string
          id?: string
          note_text: string
          note_type?: string | null
          sfdc_account_id: string
        }
        Update: {
          build_id?: string | null
          created_at?: string | null
          created_by?: string
          id?: string
          note_text?: string
          note_type?: string | null
          sfdc_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          amount: number | null
          available_to_renew: number | null
          build_id: string | null
          close_date: string | null
          cre_status: string | null
          created_at: string | null
          created_date: string | null
          id: string
          is_orphaned: boolean
          net_arr: number | null
          new_owner_id: string | null
          new_owner_name: string | null
          opportunity_name: string | null
          opportunity_type: string | null
          owner_id: string | null
          owner_name: string | null
          renewal_event_date: string | null
          sfdc_account_id: string
          sfdc_opportunity_id: string
          stage: string | null
        }
        Insert: {
          amount?: number | null
          available_to_renew?: number | null
          build_id?: string | null
          close_date?: string | null
          cre_status?: string | null
          created_at?: string | null
          created_date?: string | null
          id?: string
          is_orphaned?: boolean
          net_arr?: number | null
          new_owner_id?: string | null
          new_owner_name?: string | null
          opportunity_name?: string | null
          opportunity_type?: string | null
          owner_id?: string | null
          owner_name?: string | null
          renewal_event_date?: string | null
          sfdc_account_id: string
          sfdc_opportunity_id: string
          stage?: string | null
        }
        Update: {
          amount?: number | null
          available_to_renew?: number | null
          build_id?: string | null
          close_date?: string | null
          cre_status?: string | null
          created_at?: string | null
          created_date?: string | null
          id?: string
          is_orphaned?: boolean
          net_arr?: number | null
          new_owner_id?: string | null
          new_owner_name?: string | null
          opportunity_name?: string | null
          opportunity_type?: string | null
          owner_id?: string | null
          owner_name?: string | null
          renewal_event_date?: string | null
          sfdc_account_id?: string
          sfdc_opportunity_id?: string
          stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          developer: boolean | null
          email: string | null
          full_name: string | null
          id: string
          region: string | null
          role: Database["public"]["Enums"]["user_role"]
          team: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          developer?: boolean | null
          email?: string | null
          full_name?: string | null
          id: string
          region?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          team?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          developer?: boolean | null
          email?: string | null
          full_name?: string | null
          id?: string
          region?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          team?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          permissions?: Json
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      sales_reps: {
        Row: {
          build_id: string | null
          created_at: string
          flm: string | null
          id: string
          include_in_assignments: boolean | null
          is_active: boolean | null
          is_manager: boolean | null
          is_strategic_rep: boolean
          manager: string | null
          name: string
          region: string | null
          rep_id: string
          slm: string | null
          status_notes: string | null
          team: string | null
          updated_at: string
        }
        Insert: {
          build_id?: string | null
          created_at?: string
          flm?: string | null
          id?: string
          include_in_assignments?: boolean | null
          is_active?: boolean | null
          is_manager?: boolean | null
          is_strategic_rep?: boolean
          manager?: string | null
          name: string
          region?: string | null
          rep_id: string
          slm?: string | null
          status_notes?: string | null
          team?: string | null
          updated_at?: string
        }
        Update: {
          build_id?: string | null
          created_at?: string
          flm?: string | null
          id?: string
          include_in_assignments?: boolean | null
          is_active?: boolean | null
          is_manager?: boolean | null
          is_strategic_rep?: boolean
          manager?: string | null
          name?: string
          region?: string | null
          rep_id?: string
          slm?: string | null
          status_notes?: string | null
          team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_reps_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      batch_update_account_owners: {
        Args: { p_build_id: string; p_updates: Json }
        Returns: number
      }
      classify_parent_child_accounts: {
        Args: { p_build_id: string }
        Returns: {
          child_count: number
          parent_count: number
          updated_count: number
        }[]
      }
      create_user_profile: {
        Args: {
          user_email: string
          user_id: string
          user_region?: string
          user_role?: Database["public"]["Enums"]["user_role"]
        }
        Returns: undefined
      }
      debug_get_accounts: {
        Args: { p_build_id: string }
        Returns: {
          account_name: string
          arr: number
          is_parent: boolean
          owner_id: string
          owner_name: string
          sfdc_account_id: string
        }[]
      }
      disable_opportunity_trigger: { Args: never; Returns: undefined }
      enable_opportunity_trigger: { Args: never; Returns: undefined }
      fix_account_owner_assignments: {
        Args: { p_build_id: string }
        Returns: {
          updated_count: number
        }[]
      }
      fix_ultimate_parent_id_data: {
        Args: { p_build_id: string }
        Returns: {
          fixed_count: number
        }[]
      }
      get_current_user_region: { Args: never; Returns: string }
      get_current_user_role: { Args: never; Returns: string }
      get_orphaned_accounts: {
        Args: { p_build_id: string }
        Returns: {
          account_id: string
          account_name: string
          owner_id: string
        }[]
      }
      get_orphaned_opportunities: {
        Args: { p_build_id: string }
        Returns: {
          account_id: string
          opportunity_id: string
          owner_id: string
        }[]
      }
      get_orphaned_owners_with_details: {
        Args: { p_build_id: string }
        Returns: {
          account_count: number
          is_in_sales_reps: boolean
          owner_id: string
          owner_name: string
          total_arr: number
        }[]
      }
      mark_split_ownership: { Args: { p_build_id: string }; Returns: undefined }
      recalculate_account_values_db: {
        Args: { p_build_id: string }
        Returns: {
          accounts_updated: number
          processing_time_seconds: number
        }[]
      }
      recover_opportunity_owners: {
        Args: { p_build_id: string }
        Returns: {
          updated_count: number
        }[]
      }
      reset_build_assignments: {
        Args: { p_build_id: string }
        Returns: {
          accounts_reset: number
          assignments_deleted: number
          opportunities_reset: number
        }[]
      }
      reset_build_assignments_bulk: {
        Args: { p_build_id: string }
        Returns: {
          accounts_reset: number
          assignments_deleted: number
          opportunities_reset: number
          processing_time_seconds: number
        }[]
      }
      reset_build_assignments_optimized: {
        Args: { p_build_id: string }
        Returns: {
          accounts_reset: number
          assignments_deleted: number
          opportunities_reset: number
          processing_time_seconds: number
        }[]
      }
      reset_parent_child_relationships: {
        Args: { p_build_id: string }
        Returns: {
          restored_children: number
          updated_parents: number
        }[]
      }
      sync_missing_assignments: {
        Args: { p_build_id: string }
        Returns: {
          synced_count: number
        }[]
      }
      toggle_account_lock: {
        Args: {
          p_account_id: string
          p_build_id: string
          p_is_locking: boolean
          p_owner_id?: string
          p_owner_name?: string
        }
        Returns: undefined
      }
      update_account_calculated_values: {
        Args: { p_build_id: string }
        Returns: undefined
      }
      update_account_calculated_values_batch: {
        Args: { p_batch_size?: number; p_build_id: string }
        Returns: undefined
      }
      validate_account_classification: {
        Args: { p_build_id: string }
        Returns: {
          all_parent_accounts_found: boolean
          classification_sync_issues: number
          customers_by_flag: number
          customers_by_hierarchy_arr: number
          prospects_by_flag: number
          prospects_by_hierarchy_arr: number
          total_parent_accounts: number
        }[]
      }
      validate_owner_assignment: {
        Args: { p_build_id: string; p_owner_id: string }
        Returns: boolean
      }
      validate_parent_child_relationships: {
        Args: { p_build_id: string }
        Returns: {
          child_accounts: number
          orphaned_children: number
          parent_accounts: number
          self_referencing: number
          total_accounts: number
        }[]
      }
    }
    Enums: {
      build_status: "DRAFT" | "IN_REVIEW" | "FINALIZED"
      user_role: "SLM" | "FLM" | "REVOPS"
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
  public: {
    Enums: {
      build_status: ["DRAFT", "IN_REVIEW", "FINALIZED"],
      user_role: ["SLM", "FLM", "REVOPS"],
    },
  },
} as const
