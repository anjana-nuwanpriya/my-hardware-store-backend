const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all bank entries
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        be.*, 
        ba.account_name,
        ba.account_number,
        fba.account_name as from_account_name,
        tba.account_name as to_account_name,
        e.name as employee_name
      FROM bank_entries be
      LEFT JOIN bank_accounts ba ON be.bank_account_id = ba.id
      LEFT JOIN bank_accounts fba ON be.from_bank_account_id = fba.id
      LEFT JOIN bank_accounts tba ON be.to_bank_account_id = tba.id
      LEFT JOIN employees e ON be.employee_id = e.id
      ORDER BY be.entry_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single bank entry with items
router.get('/:id', async (req, res) => {
  try {
    const entryResult = await pool.query(
      'SELECT * FROM bank_entries WHERE id = $1',
      [req.params.id]
    );
    
    const itemsResult = await pool.query(`
      SELECT * FROM bank_entry_items
      WHERE bank_entry_id = $1
    `, [req.params.id]);

    res.json({
      entry: entryResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create bank entry
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { 
      entry_number, 
      entry_date, 
      bank_account_id, 
      transaction_type, 
      from_bank_account_id, 
      to_bank_account_id, 
      transfer_amount, 
      transfer_reference, 
      total_amount, 
      notes, 
      employee_id, 
      items 
    } = req.body;

    // Insert bank entry header
    const entryResult = await client.query(`
      INSERT INTO bank_entries 
      (entry_number, entry_date, bank_account_id, transaction_type, from_bank_account_id, to_bank_account_id, transfer_amount, transfer_reference, total_amount, notes, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [entry_number, entry_date, bank_account_id, transaction_type, from_bank_account_id, to_bank_account_id, transfer_amount, transfer_reference, total_amount, notes, employee_id]);

    const entryId = entryResult.rows[0].id;
    const amount = parseFloat(total_amount) || 0;

    // Insert items
    if (items && items.length > 0) {
      for (const item of items) {
        await client.query(`
          INSERT INTO bank_entry_items 
          (bank_entry_id, description, amount, reference_number, cheque_number, payee, source)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [entryId, item.description, item.amount, item.reference_number, item.cheque_number, item.payee, item.source]);
      }
    }

    // Update bank account balances based on transaction type
    if (transaction_type === 'deposit') {
      await client.query(`
        UPDATE bank_accounts
        SET current_balance = current_balance + $1
        WHERE id = $2
      `, [amount, bank_account_id]);
    } else if (transaction_type === 'withdrawal') {
      await client.query(`
        UPDATE bank_accounts
        SET current_balance = current_balance - $1
        WHERE id = $2
      `, [amount, bank_account_id]);
    } else if (transaction_type === 'transfer') {
      const tAmount = parseFloat(transfer_amount) || 0;
      
      // Decrease from_account
      await client.query(`
        UPDATE bank_accounts
        SET current_balance = current_balance - $1
        WHERE id = $2
      `, [tAmount, from_bank_account_id]);

      // Increase to_account
      await client.query(`
        UPDATE bank_accounts
        SET current_balance = current_balance + $1
        WHERE id = $2
      `, [tAmount, to_bank_account_id]);
    } else if (transaction_type === 'charge' || transaction_type === 'interest') {
      if (transaction_type === 'charge') {
        await client.query(`
          UPDATE bank_accounts
          SET current_balance = current_balance - $1
          WHERE id = $2
        `, [amount, bank_account_id]);
      } else {
        await client.query(`
          UPDATE bank_accounts
          SET current_balance = current_balance + $1
          WHERE id = $2
        `, [amount, bank_account_id]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(entryResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PUT update bank entry
router.put('/:id', async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await pool.query(`
      UPDATE bank_entries
      SET notes = $1
      WHERE id = $2
      RETURNING *
    `, [notes, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
