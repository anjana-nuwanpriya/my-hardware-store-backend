require('dotenv').config(); // Add this line at the top!
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/database');

async function createAdmin() {
  try {
    const email = 'admin@hardwarehaven.com';
    const password = 'password123';
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Check if staff table has password_hash column
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
      if (error.code === '23505') {
        console.log('✅ Admin user already exists');
        console.log('📧 Email:', email);
        console.log('🔑 Password: password123');
      } else {
        throw error;
      }
    } else {
      console.log('✅ Admin user created successfully!');
      console.log('📧 Email:', email);
      console.log('🔑 Password:', password);
    }
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    console.log('\n⚠️  Note: Make sure your staff table has a "password_hash" column');
  }
  
  process.exit();
}

createAdmin();