import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lolnbotrdamhukdrrsmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvbG5ib3RyZGFtaHVrZHJyc21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NTMyNjcsImV4cCI6MjA3OTIyOTI2N30.GAU8KYO_8R9DN5gzi8mFI-s6rRrwFBvZKu0EhsmYliI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const buildId = process.argv[2] || '5a77389b-1bb1-423f-adbb-837c0b1f3a28';

console.log('🔄 Syncing is_customer field for build ' + buildId + '...');

// Step 1: Set ALL parent accounts to is_customer = false first (clean slate)
let result = await supabase
  .from('accounts')
  .update({ is_customer: false })
  .eq('build_id', buildId)
  .eq('is_parent', true);

if (result.error) throw result.error;
console.log('✅ Reset all parent accounts to is_customer = false');

// Step 2: Set is_customer = true for accounts with hierarchy_bookings_arr_converted > 0
result = await supabase
  .from('accounts')
  .update({ is_customer: true })
  .eq('build_id', buildId)
  .eq('is_parent', true)
  .gt('hierarchy_bookings_arr_converted', 0);

if (result.error) throw result.error;
console.log('✅ Updated accounts with hierarchy_bookings_arr_converted > 0');

// Step 3: Set is_customer = true for accounts with calculated_arr > 0
result = await supabase
  .from('accounts')
  .update({ is_customer: true })
  .eq('build_id', buildId)
  .eq('is_parent', true)
  .gt('calculated_arr', 0);

if (result.error) throw result.error;
console.log('✅ Updated accounts with calculated_arr > 0');

// Step 4: Set is_customer = true for accounts with arr > 0
result = await supabase
  .from('accounts')
  .update({ is_customer: true })
  .eq('build_id', buildId)
  .eq('is_parent', true)
  .gt('arr', 0);

if (result.error) throw result.error;
console.log('✅ Updated accounts with arr > 0');

// Step 5: Set is_customer = true for accounts with customer children
result = await supabase
  .from('accounts')
  .update({ is_customer: true })
  .eq('build_id', buildId)
  .eq('is_parent', true)
  .eq('has_customer_hierarchy', true);

if (result.error) throw result.error;
console.log('✅ Updated accounts with has_customer_hierarchy = true');

// Log results - check what ARR values exist
console.log('📊 Checking ARR field values...');

const arrCheckResult = await supabase
  .from('accounts')
  .select('sfdc_account_id, hierarchy_bookings_arr_converted, calculated_arr, arr')
  .eq('build_id', buildId)
  .eq('is_parent', true)
  .or('hierarchy_bookings_arr_converted.gt.0,calculated_arr.gt.0,arr.gt.0')
  .limit(10);

console.log('Sample accounts with ARR > 0:', JSON.stringify(arrCheckResult.data, null, 2));
console.log('Error:', arrCheckResult.error);

// Also check total counts
const customerResult = await supabase
  .from('accounts')
  .select('*', { count: 'exact', head: true })
  .eq('build_id', buildId)
  .eq('is_parent', true)
  .eq('is_customer', true);

const prospectResult = await supabase
  .from('accounts')
  .select('*', { count: 'exact', head: true })
  .eq('build_id', buildId)
  .eq('is_parent', true)
  .eq('is_customer', false);

console.log('✅ is_customer sync completed: ' + customerResult.count + ' customers, ' + prospectResult.count + ' prospects');

