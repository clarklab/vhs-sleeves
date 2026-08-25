/**
 * The economics of one tape, and of a run of them.
 *
 * The cost basis is fixed at $15 — blank, duplication and printed sleeve at $5
 * each. Everything above that goes to the artist. Changing the sale price moves
 * the artist's cut and nothing else, which is the whole point of the panel.
 */

export interface CostLine {
  key: string
  label: string
  amount: number
}

export const COST_LINES: CostLine[] = [
  { key: 'blank', label: 'Tape blank', amount: 5 },
  { key: 'duplication', label: 'Duplication', amount: 5 },
  { key: 'sleeve', label: 'Printed sleeve', amount: 5 },
]

export const COST_BASIS = COST_LINES.reduce((total, line) => total + line.amount, 0)

/** Tapes are made in runs of 25. */
export const SET_SIZE = 25

export const DEFAULT_SALE_PRICE = 25
export const SALE_PRICE_OPTIONS = [20, 25, 30, 50]

export interface Segment extends CostLine {
  /** Share of the sale price, 0–1. Used for the stacked bar's widths. */
  share: number
}

export interface Economics {
  salePrice: number
  costBasis: number
  profitPerTape: number
  margin: number
  setSize: number
  setRevenue: number
  setCosts: number
  setProfit: number
  segments: Segment[]
}

/**
 * Break a sale price down into where the money goes, per tape and across a run.
 *
 * A sale price below the cost basis is a loss; the numbers stay honest (negative
 * profit) but the bar clamps the segment at zero width so it can't invert.
 */
export function economicsFor(salePrice: number, setSize: number = SET_SIZE): Economics {
  const profitPerTape = salePrice - COST_BASIS
  const denominator = Math.max(salePrice, COST_BASIS)

  const segments: Segment[] = [
    ...COST_LINES,
    { key: 'profit', label: 'Artist profit', amount: profitPerTape },
  ].map((line) => ({
    ...line,
    share: denominator > 0 ? Math.max(0, line.amount) / denominator : 0,
  }))

  return {
    salePrice,
    costBasis: COST_BASIS,
    profitPerTape,
    margin: salePrice > 0 ? profitPerTape / salePrice : 0,
    setSize,
    setRevenue: salePrice * setSize,
    setCosts: COST_BASIS * setSize,
    setProfit: profitPerTape * setSize,
    segments,
  }
}

/** $25 · $1,250 — no cents, because every figure here is a whole dollar. */
export function money(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  return `${sign}$${Math.abs(amount).toLocaleString('en-US')}`
}
