const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all bank accounts
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM bank_accounts
      WHERE is_active = true
      ORDER BY account_name ASC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single bank account
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM bank_accounts WHERE id = $1',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create bank account
router.post('/', async (req, res) => {
  try {
    const { account_name, account_number, bank_name, account_type, opening_balance } = req.body;
    
    const result = await pool.query(`
      INSERT INTO bank_accounts 
      (account_name, account_number, bank_name, account_type, opening_balance, current_balance)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [account_name, account_number, bank_name, account_type, opening_balance || 0, opening_balance || 0]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update bank account
router.put('/:id', async (req, res) => {
  try {
    const { account_name, account_number, bank_name, account_type } = req.body;
    const result = await pool.query(`
      UPDATE bank_accounts
      SET account_name = $1, account_number = $2, bank_name = $3, account_type = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [account_name, account_number, bank_name, account_type, req.params.id]);
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE bank account (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE bank_accounts SET is_active = false WHERE id = $1',
      [req.params.id]
    );
    res.json({ message: 'Bank account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
