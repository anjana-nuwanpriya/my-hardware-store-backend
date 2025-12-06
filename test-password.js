const bcrypt = require('bcryptjs');
const { supabase } = require('./config/database');

async function testPassword() {
  console.log('🔍 Testing Password Hash...\n');
  
  try {
    // Get the user from database
    const { data: user, error } = await supabase
      .from('staff')
      .select('*')
      .eq('email', 'admin@hardwarehaven.com')
      .single();
    
    if (error || !user) {
      console.error('❌ User not found');
      return;
    }
    
    console.log('✅ User found:', user.email);
    console.log('📝 Password hash from DB:', user.password_hash);
    console.log('');
    
    // Test passwords
    const testPasswords = ['admin123', 'Admin123', 'ADMIN123', 'password', ''];
    
    console.log('🔐 Testing different passwords:\n');
    
    for (const pwd of testPasswords) {
      const isValid = await bcrypt.compare(pwd, user.password_hash);
      console.log(`Password: "${pwd}" → ${isValid ? '✅ MATCH' : '❌ NO MATCH'}`);
    }
    
    console.log('\n---\n');
    
    // Generate correct hash for admin123
    console.log('🔧 Generating new hash for "admin123":\n');
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash('admin123', salt);
    console.log('New hash:', newHash);
    
    // Test if new hash works
    const testNew = await bcrypt.compare('admin123', newHash);
    console.log('Test new hash: ', testNew ? '✅ Works' : '❌ Failed');
    
    console.log('\n💡 To fix, run this SQL in Supabase:\n');
    console.log(`UPDATE staff SET password_hash = '${newHash}' WHERE email = 'admin@hardwarehaven.com';`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testPassword();