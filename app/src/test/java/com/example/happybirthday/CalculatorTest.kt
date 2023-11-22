package com.example.happybirthday

import org.junit.Assert.assertEquals
import org.junit.Test


class CalculatorTest {
    @Test
    fun `Test calculator can add two numbers`() {
        val calculator = Calculator()
        val expected = 10
        assertEquals(expected, calculator.addNumbers(5, 5))
    }

    @Test
    fun `Test calculator can subtract two numbers`() {
        val calculator = Calculator()
        assertEquals(5, calculator.subtractNumbers(15, 10))
    }
}