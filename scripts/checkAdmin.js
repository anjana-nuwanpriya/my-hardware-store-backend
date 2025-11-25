require('dotenv').config();
const { supabase } = require('../config/database');

async function checkAdmin() {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('email', 'admin@hardwarehaven.com')
      .single();

    if (error) {
      console.log('❌ Error:', error);
      return;
    }

    if (!data) {
      console.log('❌ No user found with that email');
      return;
    }

    console.log('✅ User found!');
    console.log('📧 Email:', data.email);
    console.log('👤 Name:', data.first_name, data.last_name);
    console.log('🔑 Has password_hash?', data.password_hash ? 'YES' : 'NO');
    console.log('🎭 Role:', data.role);
    console.log('✓ Active?', data.is_active);
    
    if (!data.password_hash) {
      console.log('\n⚠️  PASSWORD HASH IS MISSING! Need to recreate user.');
    }

  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit();
}

checkAdmin();