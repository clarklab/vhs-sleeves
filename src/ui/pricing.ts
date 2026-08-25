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
    this.element.className = 'panel pricing'
    this.element.innerHTML = `
      <div class="panel-head">
        <h3>The math</h3>
        <span class="price-pick">
          <select id="sale-price" name="salePrice" aria-label="Sale price per tape">
            ${SALE_PRICE_OPTIONS.map(
              (price) =>
                `<option value="${price}"${price === DEFAULT_SALE_PRICE ? ' selected' : ''}>$${price} each</option>`,
            ).join('')}
          </select>
          <svg viewBox="0 0 8 5" width="8" height="5" fill="none" aria-hidden="true">
            <path d="M.5.5 4 4 7.5.5" stroke="currentcolor" />
          </svg>
        </span>
      </div>
      <p class="hero"></p>
      <div class="bar" role="img"></div>
      <ul class="legend" role="list"></ul>
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
      `<span class="hero-value">${money(data.profitPerTape)}</span>` +
      `<span class="hero-label">to the artist, per tape · ${money(data.costBasis)} cost basis</span>`

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
      [`${data.setSize} tapes`, money(data.setRevenue)],
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
