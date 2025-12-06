// Test database connection and check for staff table
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('🔍 Testing Supabase Connection...\n');
  
  try {
    // Test 1: Check if staff table exists
    console.log('📋 Test 1: Checking if staff table exists...');
    const { data: tables, error: tableError } = await supabase
      .from('staff')
      .select('count')
      .limit(1);
    
    if (tableError) {
      console.error('❌ Staff table does NOT exist!');
      console.error('Error:', tableError.message);
      console.log('\n💡 Solution: You need to run the SQL file in Supabase to create the staff table.');
      return;
    }
    
    console.log('✅ Staff table exists!\n');
    
    // Test 2: Check for admin user
    console.log('📋 Test 2: Looking for admin user...');
    const { data: users, error: userError } = await supabase
      .from('staff')
      .select('*')
      .eq('email', 'admin@hardwarehaven.com');
    
    if (userError) {
      console.error('❌ Error querying users:', userError.message);
      return;
    }
    
    if (!users || users.length === 0) {
      console.error('❌ Admin user NOT found!');
      console.log('\n💡 Solution: Run the seed-data.sql file to create the admin user.');
      return;
    }
    
    console.log('✅ Admin user found!');
    console.log('\nUser details:');
    console.log('  Email:', users[0].email);
    console.log('  Name:', users[0].first_name, users[0].last_name);
    console.log('  Role:', users[0].role);
    console.log('  Active:', users[0].is_active);
    console.log('  Has password_hash:', !!users[0].password_hash);
    
    if (!users[0].password_hash) {
      console.error('\n❌ ERROR: User exists but has NO password_hash!');
      console.log('💡 Solution: Re-run the seed-data.sql file.');
    } else {
      console.log('\n🎉 Everything looks good! Login should work.');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

testConnection();