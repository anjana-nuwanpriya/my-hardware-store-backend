// ============================================================================
// FILE: backend/routes/supplier-opening-balance.js
// ============================================================================
const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all supplier opening balances
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        sob.*, 
        s.name as supplier_name,
        e.name as employee_name
      FROM supplier_opening_balances sob
      LEFT JOIN suppliers s ON sob.supplier_id = s.id
      LEFT JOIN employees e ON sob.employee_id = e.id
      ORDER BY sob.entry_date DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching supplier opening balances:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single record
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM supplier_opening_balances WHERE id = $1',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new
router.post('/', async (req, res) => {
  const { entry_number, entry_date, supplier_id, amount, balance_type, notes, employee_id } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO supplier_opening_balances 
      (entry_number, entry_date, supplier_id, amount, balance_type, notes, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [entry_number, entry_date, supplier_id, amount, balance_type, notes, employee_id]
    );

    // Update supplier op_balance
    await pool.query(
      `UPDATE suppliers 
      SET op_balance = op_balance + $1 
      WHERE id = $2`,
      [amount, supplier_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating supplier opening balance:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  const { amount, balance_type, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE supplier_opening_balances
      SET amount = $1, balance_type = $2, notes = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *`,
      [amount, balance_type, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM supplier_opening_balances WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;