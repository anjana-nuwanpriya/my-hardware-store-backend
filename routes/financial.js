const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// ==================== PETTY CASH VOUCHER ====================

// GET all petty cash vouchers
router.get('/petty-cash', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('petty_cash_voucher')
      .select(`
        *,
        stores(store_name)
      `)
      .order('voucher_date', { ascending: false });
    
    if (error) throw error;
    res.json({ vouchers: data || [] });
  } catch (error) {
    console.error('Error fetching petty cash:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create petty cash voucher
router.post('/petty-cash', async (req, res) => {
  try {
    const {
      store_id,
      voucher_date,
      description,
      amount,
      category
    } = req.body;
    const user = req.user;

    if (!store_id || !amount || !description) {
      return res.status(400).json({ error: 'Store, amount, and description are required' });
    }

    // Generate voucher number
    const { data: lastVoucher } = await supabase
      .from('petty_cash_voucher')
      .select('voucher_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let voucherNumber = 'PCV-0001';
    if (lastVoucher && lastVoucher.voucher_number) {
      const lastNumber = parseInt(lastVoucher.voucher_number.split('-')[1]);
      voucherNumber = `PCV-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    const { data, error } = await supabase
      .from('petty_cash_voucher')
      .insert([{
        voucher_number: voucherNumber,
        store_id,
        voucher_date: voucher_date || new Date().toISOString().split('T')[0],
        description,
        amount: parseFloat(amount),
        category,
        created_by: user?.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Petty cash voucher created successfully',
      voucher: data,
      voucher_number: voucherNumber
    });

  } catch (error) {
    console.error('Error creating petty cash voucher:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE petty cash voucher
router.delete('/petty-cash/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('petty_cash_voucher')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Petty cash voucher deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== GENERAL RECEIPTS ====================

// GET all general receipts
router.get('/general-receipts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('general_receipts')
      .select(`
        *,
        stores(store_name)
      `)
      .order('receipt_date', { ascending: false });
    
    if (error) throw error;
    res.json({ receipts: data || [] });
  } catch (error) {
    console.error('Error fetching general receipts:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create general receipt
router.post('/general-receipts', async (req, res) => {
  try {
    const {
      store_id,
      receipt_date,
      description,
      amount,
      received_from,
      category
    } = req.body;
    const user = req.user;

    if (!store_id || !amount || !description) {
      return res.status(400).json({ error: 'Store, amount, and description are required' });
    }

    // Generate receipt number
    const { data: lastReceipt } = await supabase
      .from('general_receipts')
      .select('receipt_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let receiptNumber = 'GR-0001';
    if (lastReceipt && lastReceipt.receipt_number) {
      const lastNumber = parseInt(lastReceipt.receipt_number.split('-')[1]);
      receiptNumber = `GR-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    const { data, error } = await supabase
      .from('general_receipts')
      .insert([{
        receipt_number: receiptNumber,
        store_id,
        receipt_date: receipt_date || new Date().toISOString().split('T')[0],
        description,
        amount: parseFloat(amount),
        received_from,
        category,
        created_by: user?.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'General receipt created successfully',
      receipt: data,
      receipt_number: receiptNumber
    });

  } catch (error) {
    console.error('Error creating general receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE general receipt
router.delete('/general-receipts/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('general_receipts')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'General receipt deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== BANK ENTRIES ====================

// GET all bank entries
router.get('/bank-entries', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bank_entries')
      .select('*')
      .order('entry_date', { ascending: false });
    
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (error) {
    console.error('Error fetching bank entries:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create bank entry
router.post('/bank-entries', async (req, res) => {
  try {
    const {
      entry_date,
      entry_type,
      amount,
      bank_account,
      description,
      reference_no
    } = req.body;
    const user = req.user;

    if (!entry_type || !amount || !bank_account) {
      return res.status(400).json({ error: 'Entry type, amount, and bank account are required' });
    }

    // Generate entry number
    const { data: lastEntry } = await supabase
      .from('bank_entries')
      .select('entry_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let entryNumber = 'BE-0001';
    if (lastEntry && lastEntry.entry_number) {
      const lastNumber = parseInt(lastEntry.entry_number.split('-')[1]);
      entryNumber = `BE-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    const { data, error } = await supabase
      .from('bank_entries')
      .insert([{
        entry_number: entryNumber,
        entry_date: entry_date || new Date().toISOString().split('T')[0],
        entry_type, // deposit/withdrawal/charge/transfer
        amount: parseFloat(amount),
        bank_account,
        description,
        reference_no,
        created_by: user?.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Bank entry created successfully',
      entry: data,
      entry_number: entryNumber
    });

  } catch (error) {
    console.error('Error creating bank entry:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE bank entry
router.delete('/bank-entries/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('bank_entries')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Bank entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;