const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all inventory
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('*');
    
    if (error) throw error;
    res.json({ inventory: data || [] });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Adjust stock
router.post('/adjust', async (req, res) => {
  try {
    const { product_id, quantity, movement_type, notes } = req.body;

    console.log('📦 Stock adjustment request:', { product_id, quantity, movement_type });

    // Validation
    if (!product_id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    if (!quantity || quantity === 0) {
      return res.status(400).json({ error: 'Quantity must be a non-zero number' });
    }

    // Get current inventory
    const { data: currentInventory, error: fetchError } = await supabase
      .from('inventory')
      .select('*')
      .eq('product_id', product_id)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching inventory:', fetchError);
      throw fetchError;
    }

    if (!currentInventory) {
      return res.status(404).json({ error: 'Inventory record not found for this product' });
    }

    console.log('📊 Current inventory:', currentInventory);

    // Calculate new quantities
    const adjustmentAmount = parseInt(quantity);
    const newQuantityOnHand = (currentInventory.quantity_on_hand || 0) + adjustmentAmount;
    const quantityReserved = currentInventory.quantity_reserved || 0;
    const newQuantityAvailable = newQuantityOnHand - quantityReserved;

    // Don't allow negative stock
    if (newQuantityOnHand < 0) {
      return res.status(400).json({ 
        error: 'Cannot reduce stock below zero',
        current: currentInventory.quantity_on_hand,
        attempted: adjustmentAmount
      });
    }

    console.log('📈 New quantities:', { 
      newQuantityOnHand, 
      quantityReserved, 
      newQuantityAvailable 
    });

    // Update inventory
const { data: updatedInventory, error: updateError } = await supabase
  .from('inventory')
  .update({
    quantity_on_hand: newQuantityOnHand,
    // quantity_available is auto-calculated!
    updated_at: new Date().toISOString()
  })
      .eq('product_id', product_id)
      .select();

    if (updateError) {
      console.error('❌ Error updating inventory:', updateError);
      throw updateError;
    }

    console.log('✅ Inventory updated successfully');

    // Create stock movement record for audit trail
    const movementTypeForRecord = movement_type || (adjustmentAmount > 0 ? 'adjustment_in' : 'adjustment_out');
    
    const { error: movementError } = await supabase
      .from('stock_movements')
      .insert([{
        product_id,
        movement_type: movementTypeForRecord,
        quantity: adjustmentAmount,
        reference_type: 'manual_adjustment',
        notes: notes || 'Manual stock adjustment',
        created_at: new Date().toISOString()
      }]);

    if (movementError) {
      console.error('⚠️ Warning: Failed to create stock movement record:', movementError);
      // Don't fail the request if movement record fails
    } else {
      console.log('✅ Stock movement recorded');
    }

    res.json({ 
      message: 'Stock adjusted successfully',
      inventory: updatedInventory[0],
      adjustment: adjustmentAmount,
      newStock: newQuantityOnHand
    });

  } catch (error) {
    console.error('❌ Error adjusting stock:', error);
    res.status(500).json({ 
      error: 'Failed to adjust stock: ' + error.message 
    });
  }
});

module.exports = router;