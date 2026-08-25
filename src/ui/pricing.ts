import {
  DEFAULT_SALE_PRICE,
  Economics,
  SALE_PRICE_OPTIONS,
  economicsFor,
  money,
} from '../sleeves/pricing'

/**
 * Where the money goes.
 *
 * One stacked bar is the right form here: this is a single whole (the sale price)
 * split into named parts, not a comparison across categories. The run totals are
 * stat tiles rather than a second chart — three numbers don't need axes.
 */
export class PricingPanel {
  readonly element: HTMLElement
  private salePrice = DEFAULT_SALE_PRICE
  private bar: HTMLElement
  private legend: HTMLElement
  private hero: HTMLElement
  private tiles: HTMLElement
  private select: HTMLSelectElement

  constructor() {
    this.element = document.createElement('section')
    this.element.className = 'pricing'
    this.element.innerHTML = `
      <header class="pricing-head">
        <h3>The math</h3>
        <label class="price-pick">
          <span>Sell at</span>
          <select aria-label="Sale price per tape">
            ${SALE_PRICE_OPTIONS.map(
              (price) =>
                `<option value="${price}"${price === DEFAULT_SALE_PRICE ? ' selected' : ''}>$${price}</option>`,
            ).join('')}
          </select>
        </label>
      </header>
      <p class="hero"></p>
      <div class="bar" role="img"></div>
      <ul class="legend"></ul>
      <dl class="tiles"></dl>
    `

    this.bar = this.element.querySelector('.bar')!
    this.legend = this.element.querySelector('.legend')!
    this.hero = this.element.querySelector('.hero')!
    this.tiles = this.element.querySelector('.tiles')!
    this.select = this.element.querySelector('select')!

    this.select.addEventListener('change', () => {
      this.salePrice = Number(this.select.value)
      this.render()
    })

    this.render()
  }

  private render(): void {
    const data = economicsFor(this.salePrice)

    this.hero.innerHTML =
      `<strong>${money(data.profitPerTape)}</strong> to the artist per tape` +
      `<span> · ${money(data.costBasis)} cost basis</span>`

    this.bar.setAttribute(
      'aria-label',
      `Of a ${money(data.salePrice)} sale: ` +
        data.segments.map((s) => `${s.label} ${money(s.amount)}`).join(', '),
    )
    this.bar.innerHTML = data.segments
      .map(
        (segment, i) =>
          `<span class="seg" data-series="${i + 1}" style="flex-grow:${Math.max(segment.share, 0.0001)}">
             <span class="seg-value">${money(segment.amount)}</span>
           </span>`,
      )
      .join('')

    this.legend.innerHTML = data.segments
      .map(
        (segment, i) =>
          `<li><i data-series="${i + 1}"></i>${segment.label}<b>${money(segment.amount)}</b></li>`,
      )
      .join('')

    this.renderTiles(data)
  }

  private renderTiles(data: Economics): void {
    const rows: [string, string][] = [
      [`Run of ${data.setSize}`, money(data.setRevenue)],
      ['Costs', money(data.setCosts)],
      ['Artist take', money(data.setProfit)],
    ]
    this.tiles.innerHTML = rows
      .map(
        ([label, value], i) =>
          `<div${i === rows.length - 1 ? ' class="accent"' : ''}>
             <dt>${label}</dt><dd>${value}</dd>
           </div>`,
      )
      .join('')
  }
}
