require('dotenv').config();
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/database');

async function recreateAdmin() {
  try {
    const email = 'admin@hardwarehaven.com';
    const password = 'password123';
    
    console.log('🗑️  Deleting old admin user...');
    
    // Delete existing user
    await supabase
      .from('staff')
      .delete()
      .eq('email', email);
    
    console.log('✅ Old user deleted');
    console.log('🔐 Creating new admin with hashed password...');
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    console.log('🔑 Password hash created:', password_hash.substring(0, 20) + '...');

    // Create new user with password hash
    const { data, error } = await supabase
      .from('staff')
      .insert([{
        employee_id: 'EMP001',
        first_name: 'Admin',
        last_name: 'User',
        email,
        password_hash,
        role: 'admin',
        phone: '+94123456789',
        is_active: true,
        permissions: ['all']
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating user:', error);
      throw error;
    }

    console.log('\n✅ Admin user created successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('🎭 Role:', data.role);
    console.log('✓ Has password hash?', data.password_hash ? 'YES ✓' : 'NO ✗');

  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit();
}

recreateAdmin();