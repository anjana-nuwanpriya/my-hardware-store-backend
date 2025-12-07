// ============================================================================
// FILE: backend/routes/petty-cash-voucher.js
// ============================================================================
const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all vouchers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pcv.*, 
        e.name as employee_name
      FROM petty_cash_vouchers pcv
      LEFT JOIN employees e ON pcv.employee_id = e.id
      ORDER BY pcv.voucher_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single voucher with items
router.get('/:id', async (req, res) => {
  try {
    const voucherResult = await pool.query(
      'SELECT * FROM petty_cash_vouchers WHERE id = $1',
      [req.params.id]
    );
    
    const itemsResult = await pool.query(`
      SELECT * FROM petty_cash_voucher_items
      WHERE voucher_id = $1
    `, [req.params.id]);

    res.json({
      voucher: voucherResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create voucher
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { voucher_number, voucher_date, expense_category, payment_method, total_amount, paid_by, approved_by, notes, employee_id, items } = req.body;

    // Insert voucher header
    const voucherResult = await client.query(`
      INSERT INTO petty_cash_vouchers 
      (voucher_number, voucher_date, expense_category, payment_method, total_amount, paid_by, approved_by, notes, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [voucher_number, voucher_date, expense_category, payment_method, total_amount, paid_by, approved_by, notes, employee_id]);

    const voucherId = voucherResult.rows[0].id;

    // Insert items (NO STOCK IMPACT)
    for (const item of items) {
      await client.query(`
        INSERT INTO petty_cash_voucher_items 
        (voucher_id, description, amount, receipt_number, paid_to)
        VALUES ($1, $2, $3, $4, $5)
      `, [voucherId, item.description, item.amount, item.receipt_number, item.paid_to]);
    }

    await client.query('COMMIT');
    res.status(201).json(voucherResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PUT update voucher
router.put('/:id', async (req, res) => {
  const { expense_category, payment_method, notes } = req.body;
  try {
    const result = await pool.query(`
      UPDATE petty_cash_vouchers
      SET expense_category = $1, payment_method = $2, notes = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [expense_category, payment_method, notes, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE voucher
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM petty_cash_voucher_items WHERE voucher_id = $1', [req.params.id]);
    await pool.query('DELETE FROM petty_cash_vouchers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Voucher deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;