// ============================================================================
// FILE: backend/routes/customer-payments.js
// ============================================================================
const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// POST create customer payment
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { receipt_number, payment_date, customer_id, payment_method, reference_number, total_payment_amount, notes, employee_id, allocations } = req.body;

    // Insert payment
    const paymentResult = await client.query(`
      INSERT INTO customer_payments 
      (receipt_number, payment_date, customer_id, payment_method, reference_number, total_payment_amount, notes, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [receipt_number, payment_date, customer_id, payment_method, reference_number, total_payment_amount, notes, employee_id]);

    const paymentId = paymentResult.rows[0].id;

    // Insert allocations
    for (const alloc of allocations) {
      await client.query(`
        INSERT INTO customer_payment_allocations 
        (customer_payment_id, sales_retail_id, sales_wholesale_id, invoice_number, invoice_date, invoice_amount, paid_amount, outstanding, payment_amount)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [paymentId, alloc.sales_retail_id, alloc.sales_wholesale_id, alloc.invoice_number, alloc.invoice_date, alloc.invoice_amount, alloc.paid_amount, alloc.outstanding, alloc.payment_amount]);
    }

    // Reduce customer receivable
    await client.query(`
      UPDATE customers
      SET op_balance = op_balance - $1
      WHERE id = $2
    `, [total_payment_amount, customer_id]);

    await client.query('COMMIT');
    res.status(201).json(paymentResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// GET all payments
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        cp.*, 
        c.name as customer_name,
        e.name as employee_name
      FROM customer_payments cp
      LEFT JOIN customers c ON cp.customer_id = c.id
      LEFT JOIN employees e ON cp.employee_id = e.id
      ORDER BY cp.payment_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single payment with allocations
router.get('/:id', async (req, res) => {
  try {
    const paymentResult = await pool.query(
      'SELECT * FROM customer_payments WHERE id = $1',
      [req.params.id]
    );
    
    const allocationsResult = await pool.query(`
      SELECT * FROM customer_payment_allocations
      WHERE customer_payment_id = $1
    `, [req.params.id]);

    res.json({
      payment: paymentResult.rows[0],
      allocations: allocationsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;