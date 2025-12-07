const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all supplier payments
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        sp.*, 
        s.name as supplier_name,
        e.name as employee_name
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON sp.supplier_id = s.id
      LEFT JOIN employees e ON sp.employee_id = e.id
      ORDER BY sp.payment_date DESC
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
      'SELECT * FROM supplier_payments WHERE id = $1',
      [req.params.id]
    );
    
    const allocationsResult = await pool.query(`
      SELECT 
        spa.*,
        pg.grn_number
      FROM supplier_payment_allocations spa
      LEFT JOIN purchase_grns pg ON spa.purchase_grn_id = pg.id
      WHERE spa.supplier_payment_id = $1
    `, [req.params.id]);

    res.json({
      payment: paymentResult.rows[0],
      allocations: allocationsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create supplier payment
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { payment_number, payment_date, supplier_id, payment_method, reference_number, total_payment_amount, notes, employee_id, allocations } = req.body;

    // Insert payment
    const paymentResult = await client.query(`
      INSERT INTO supplier_payments 
      (payment_number, payment_date, supplier_id, payment_method, reference_number, total_payment_amount, notes, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [payment_number, payment_date, supplier_id, payment_method, reference_number, total_payment_amount, notes, employee_id]);

    const paymentId = paymentResult.rows[0].id;

    // Insert allocations
    for (const alloc of allocations) {
      await client.query(`
        INSERT INTO supplier_payment_allocations 
        (supplier_payment_id, purchase_grn_id, invoice_number, invoice_date, invoice_amount, paid_amount, outstanding, payment_amount)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [paymentId, alloc.purchase_grn_id, alloc.invoice_number, alloc.invoice_date, alloc.invoice_amount, alloc.paid_amount, alloc.outstanding, alloc.payment_amount]);
    }

    // Reduce supplier payable
    await client.query(`
      UPDATE suppliers
      SET op_balance = op_balance - $1
      WHERE id = $2
    `, [total_payment_amount, supplier_id]);

    await client.query('COMMIT');
    res.status(201).json(paymentResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
