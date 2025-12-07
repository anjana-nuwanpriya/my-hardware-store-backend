const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all dispatch notes
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        idn.*, 
        fs.name as from_store_name,
        ts.name as to_store_name,
        e.name as employee_name
      FROM item_dispatch_notes idn
      LEFT JOIN stores fs ON idn.from_store_id = fs.id
      LEFT JOIN stores ts ON idn.to_store_id = ts.id
      LEFT JOIN employees e ON idn.employee_id = e.id
      WHERE idn.is_active = true
      ORDER BY idn.dispatch_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single dispatch note with items
router.get('/:id', async (req, res) => {
  try {
    const dispatchResult = await pool.query(
      'SELECT * FROM item_dispatch_notes WHERE id = $1',
      [req.params.id]
    );
    
    const itemsResult = await pool.query(`
      SELECT 
        idni.*,
        i.code as item_code,
        i.name as item_name
      FROM item_dispatch_note_items idni
      LEFT JOIN items i ON idni.item_id = i.id
      WHERE idni.dispatch_note_id = $1
    `, [req.params.id]);

    res.json({
      dispatch: dispatchResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create dispatch note
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { dispatch_number, dispatch_date, from_store_id, to_store_id, ref_number, description, vehicle_number, driver_name, employee_id, items } = req.body;

    // Insert dispatch header
    const dispatchResult = await client.query(`
      INSERT INTO item_dispatch_notes 
      (dispatch_number, dispatch_date, from_store_id, to_store_id, ref_number, description, vehicle_number, driver_name, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [dispatch_number, dispatch_date, from_store_id, to_store_id, ref_number, description, vehicle_number, driver_name, employee_id]);

    const dispatchId = dispatchResult.rows[0].id;

    // Insert items and update stock in both stores
    for (const item of items) {
      await client.query(`
        INSERT INTO item_dispatch_note_items 
        (dispatch_note_id, item_id, batch_no, quantity, unit_price, net_value)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [dispatchId, item.item_id, item.batch_no, item.quantity, item.unit_price, item.net_value]);

      // Decrease stock in FROM store
      await client.query(`
        UPDATE items
        SET stock_quantity = stock_quantity - $1
        WHERE id = $2
      `, [item.quantity, item.item_id]);

      // NOTE: If you have store-specific inventory, update that table here
      // For now, we're assuming global item stock
    }

    await client.query('COMMIT');
    res.status(201).json(dispatchResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PUT update dispatch note
router.put('/:id', async (req, res) => {
  const { vehicle_number, driver_name, description } = req.body;
  try {
    const result = await pool.query(`
      UPDATE item_dispatch_notes
      SET vehicle_number = $1, driver_name = $2, description = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [vehicle_number, driver_name, description, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
