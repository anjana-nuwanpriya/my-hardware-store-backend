const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all customer payments
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customer_payment')
      .select(`
        *,
        customers(first_name, last_name, customer_number)
      `)
      .order('payment_date', { ascending: false });
    
    if (error) throw error;
    res.json({ payments: data || [] });
  } catch (error) {
    console.error('Error fetching customer payments:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET payments by customer
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customer_payment')
      .select('*')
      .eq('customer_id', req.params.customerId)
      .order('payment_date', { ascending: false });
    
    if (error) throw error;
    res.json({ payments: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create payment
router.post('/', async (req, res) => {
  try {
    const {
      customer_id,
      payment_date,
      amount,
      payment_method,
      reference_no,
      notes
    } = req.body;
    const user = req.user;

    if (!customer_id || !amount) {
      return res.status(400).json({ error: 'Customer and amount are required' });
    }

    // Generate payment number
    const { data: lastPayment } = await supabase
      .from('customer_payment')
      .select('payment_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let paymentNumber = 'CP-0001';
    if (lastPayment && lastPayment.payment_number) {
      const lastNumber = parseInt(lastPayment.payment_number.split('-')[1]);
      paymentNumber = `CP-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    const { data, error } = await supabase
      .from('customer_payment')
      .insert([{
        payment_number: paymentNumber,
        customer_id,
        payment_date: payment_date || new Date().toISOString().split('T')[0],
        amount: parseFloat(amount),
        payment_method: payment_method || 'cash',
        reference_no,
        notes,
        created_by: user?.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Payment recorded successfully',
      payment: data,
      payment_number: paymentNumber
    });

  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE payment
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('customer_payment')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;