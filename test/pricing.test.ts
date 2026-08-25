import { describe, expect, it } from 'vitest'
import {
  COST_BASIS,
  DEFAULT_SALE_PRICE,
  SALE_PRICE_OPTIONS,
  SET_SIZE,
  economicsFor,
  money,
} from '../src/sleeves/pricing'

describe('cost basis', () => {
  it('is $15 — blank, duplication and sleeve at $5 each', () => {
    expect(COST_BASIS).toBe(15)
  })

  it('sells sets of 25 at $25 by default', () => {
    expect(SET_SIZE).toBe(25)
    expect(DEFAULT_SALE_PRICE).toBe(25)
    expect(SALE_PRICE_OPTIONS).toContain(DEFAULT_SALE_PRICE)
  })
})

describe('economicsFor', () => {
  it('gives the artist $10 a tape at the default price', () => {
    const data = economicsFor(25)
    expect(data.profitPerTape).toBe(10)
    expect(data.costBasis).toBe(15)
  })

  it('works out a run of 25 at $25', () => {
    const data = economicsFor(25)
    expect(data.setRevenue).toBe(625)
    expect(data.setCosts).toBe(375)
    expect(data.setProfit).toBe(250)
  })

  it('moves only the artist cut when the price changes', () => {
    for (const price of SALE_PRICE_OPTIONS) {
      const data = economicsFor(price)
      expect(data.costBasis).toBe(15)
      expect(data.profitPerTape).toBe(price - 15)
      expect(data.setProfit).toBe((price - 15) * 25)
    }
  })

  it('splits the sale price into four segments that add back up', () => {
    const data = economicsFor(50)
    expect(data.segments).toHaveLength(4)
    const total = data.segments.reduce((sum, segment) => sum + segment.amount, 0)
    expect(total).toBe(50)
    expect(data.segments.at(-1)!.label).toBe('Artist profit')
    expect(data.segments.at(-1)!.amount).toBe(35)
  })

  it('has segment shares that fill the bar exactly', () => {
    for (const price of SALE_PRICE_OPTIONS) {
      const shares = economicsFor(price).segments.reduce((sum, s) => sum + s.share, 0)
      expect(shares).toBeCloseTo(1, 6)
    }
  })

  it('reports a loss honestly but never inverts the bar', () => {
    const data = economicsFor(10)
    expect(data.profitPerTape).toBe(-5)
    expect(data.setProfit).toBe(-125)
    for (const segment of data.segments) expect(segment.share).toBeGreaterThanOrEqual(0)
  })
})

describe('money', () => {
  it('formats whole dollars with thousands separators', () => {
    expect(money(10)).toBe('$10')
    expect(money(625)).toBe('$625')
    expect(money(1250)).toBe('$1,250')
  })

  it('puts the sign before the symbol', () => {
    expect(money(-125)).toBe('-$125')
  })
})
