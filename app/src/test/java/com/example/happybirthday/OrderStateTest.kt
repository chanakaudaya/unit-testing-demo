package com.example.happybirthday


import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue


class OrderStateTest {
    private val LAPTOP = "Macbook"
    private val MOUSE = "Logitech Mouse"
    private val warehouse = Warehouse()

    @Test
    fun `test order is fulfilled if capacity in warehouse is sufficient`() {
        warehouse.add(LAPTOP, 50)
        warehouse.add(MOUSE, 20)
        val order = Order(LAPTOP, 20)
        order.fill(warehouse)
        assertTrue(order.isFilled())
        assertEquals(30, warehouse.getInventory(LAPTOP))
    }


    @Test
    fun `test order is not fulfilled if capacity in warehouse is insufficient`() {
        warehouse.add(LAPTOP, 50)
        warehouse.add(MOUSE, 20)
        val order = Order(MOUSE, 21)
        order.fill(warehouse)
        assertFalse(order.isFilled())
        assertEquals(20, warehouse.getInventory(MOUSE))
    }

    @Test
    fun `test warehouse does not contain the product` () {
        warehouse.add(LAPTOP, 50)
        assertFalse(warehouse.remove(MOUSE, 10))
    }

    @Test
    fun `test warehouse contains zero items of a product` () {
        warehouse.add(LAPTOP, 20)
        val order = Order(LAPTOP, 20)
        order.fill(warehouse)
        assertFalse(warehouse.remove(LAPTOP, 10))
    }


}