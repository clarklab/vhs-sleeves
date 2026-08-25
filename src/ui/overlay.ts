import templateUrl from '../../template/VHS-2025-01-29.pdf?url'
import { formatOwners } from '../sleeves/registry'
import type { LibraryScene } from '../three/LibraryScene'
import type { SleeveCard } from '../three/SleeveCard'
import { PricingPanel } from './pricing'
import { UploadPanel } from './upload'

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id} in index.html`)
  return node as T
}

const STATE_TEXT: Record<string, string> = {
  loading: 'Rendering artwork…',
  ready: '',
  failed: 'This PDF could not be rendered. Re-export it and submit again.',
  awaiting: 'No artwork yet — download the blank template to get started.',
}

/**
 * The DOM layer: masthead, projected grid labels, and the detail panel that owns
 * a sleeve's people, files, viewer controls, economics and upload.
 *
 * It reads scene state and calls back into it; it stores none of its own.
 */
export class Overlay {
  private labels = new Map<string, HTMLElement>()
  private count = el<HTMLParagraphElement>('count')
  private empty = el<HTMLParagraphElement>('empty')
  private detail = el<HTMLElement>('detail')
  private backButton = el<HTMLButtonElement>('back')
  private detailTitle = el<HTMLHeadingElement>('detail-title')
  private detailOwners = el<HTMLParagraphElement>('detail-owners')
  private detailState = el<HTMLParagraphElement>('detail-state')
  private downloadCurrent = el<HTMLAnchorElement>('download-current')
  private downloadTemplate = el<HTMLAnchorElement>('download-template')
  private foldInput = el<HTMLInputElement>('fold')
  private foldReadout = el<HTMLSpanElement>('fold-readout')
  private ejectButton = el<HTMLButtonElement>('eject')
  private labelHost = el<HTMLDivElement>('labels')
  private accepted = el<HTMLDivElement>('accepted')
  private pricing = new PricingPanel()
  private upload: UploadPanel

  constructor(private scene: LibraryScene) {
    this.upload = new UploadPanel((result) => this.showAccepted(result))
    el('pricing-slot').replaceWith(this.pricing.element)
    el('upload-slot').replaceWith(this.upload.element)

    this.downloadTemplate.href = templateUrl
    this.downloadTemplate.setAttribute('download', 'vhs-sleeve-template.pdf')

    this.backButton.addEventListener('click', () => scene.unfocus())

    this.foldInput.addEventListener('input', () => {
      const t = Number(this.foldInput.value) / 100
      this.foldReadout.textContent = `${this.foldInput.value}%`
      scene.focused?.setFold(t)
    })

    this.ejectButton.addEventListener('click', () => {
      const card = scene.focused
      if (!card) return
      if (card.getFold() < 0.98) {
        this.setFoldSlider(1)
        card.setFold(1)
      }
      card.toggleCassette()
    })

    el<HTMLButtonElement>('accepted-close').addEventListener('click', () => {
      this.accepted.hidden = true
    })

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      if (!this.accepted.hidden) this.accepted.hidden = true
      else scene.unfocus()
    })

    scene.onFocusChange((card) => this.showDetail(card))
  }

  /** Width the 3D view should keep clear so the box isn't behind the panel. */
  get detailInsetPx(): number {
    if (window.innerWidth < 900) return 0
    return this.detail.getBoundingClientRect().width
  }

  registerCards(cards: SleeveCard[]): void {
    this.labelHost.replaceChildren()
    this.labels.clear()
    for (const card of cards) {
      const node = document.createElement('div')
      node.className = 'label'
      node.dataset.state = card.state
      node.innerHTML =
        `<span class="label-title">${card.source.title}</span>` +
        `<span class="label-owners">${formatOwners(card.source.owners)}</span>`
      this.labelHost.append(node)
      this.labels.set(card.source.id, node)
    }
    this.empty.hidden = cards.length > 0
    this.updateCount(cards)
  }

  updateCount(cards: SleeveCard[]): void {
    const ready = cards.filter((c) => c.state === 'ready').length
    const awaiting = cards.filter((c) => c.state === 'awaiting').length
    const failed = cards.filter((c) => c.state === 'failed').length
    const parts = [`${cards.length} ${cards.length === 1 ? 'sleeve' : 'sleeves'}`]
    if (awaiting) parts.push(`${awaiting} awaiting artwork`)
    if (failed) parts.push(`${failed} failed`)
    else if (ready < cards.length - awaiting) parts.push('rendering…')
    this.count.textContent = parts.join(' · ')
  }

  markCard(card: SleeveCard): void {
    const node = this.labels.get(card.source.id)
    if (node) node.dataset.state = card.state
    if (this.scene.focused === card) this.showDetail(card)
  }

  private showDetail(card: SleeveCard | null): void {
    this.detail.hidden = card === null
    this.backButton.hidden = card === null
    this.labelHost.style.opacity = card ? '0' : '1'
    if (!card) return

    const { source } = card
    this.detailTitle.textContent = source.title
    this.detailOwners.innerHTML =
      `<span class="owner-label">Project ${source.owners.length === 1 ? 'owner' : 'owners'}</span>` +
      `<span class="owner-names">${formatOwners(source.owners)}</span>`

    const state = STATE_TEXT[card.state] ?? ''
    this.detailState.textContent = state
    this.detailState.hidden = state === ''
    this.detailState.dataset.tone = card.state

    if (source.url) {
      this.downloadCurrent.href = source.url
      this.downloadCurrent.setAttribute('download', `${source.id}.pdf`)
      this.downloadCurrent.hidden = false
    } else {
      this.downloadCurrent.hidden = true
    }

    this.setFoldSlider(card.getFold())
    this.upload.setSleeve(source)
  }

  private showAccepted(result: { commitSha?: string; commitUrl?: string }): void {
    const card = this.scene.focused
    el('accepted-title').textContent = card?.source.title ?? 'Your sleeve'
    const sha = el<HTMLSpanElement>('accepted-sha')
    sha.textContent = result.commitSha ? `· ${result.commitSha}` : ''
    const link = el<HTMLAnchorElement>('accepted-commit')
    if (result.commitUrl) {
      link.href = result.commitUrl
      link.hidden = false
    } else {
      link.hidden = true
    }
    this.accepted.hidden = false
  }

  private setFoldSlider(t: number): void {
    const percent = Math.round(t * 100)
    this.foldInput.value = String(percent)
    this.foldReadout.textContent = `${percent}%`
  }

  private syncEjectLabel(): void {
    const card = this.scene.focused
    if (!card) return
    const canHoldTape = card.state === 'ready' || card.state === 'awaiting'
    this.ejectButton.disabled = !canHoldTape
    this.ejectButton.textContent = card.cassetteIsIn ? 'Eject tape' : 'Insert tape'
  }

  tick(cards: SleeveCard[]): void {
    if (this.scene.focused) {
      // The tape moves for reasons the panel didn't initiate — the auto-insert on
      // open, or the fold slider forcing an eject — so the button reads the card
      // every frame rather than trusting the last click.
      this.syncEjectLabel()
      return
    }
    for (const card of cards) {
      const node = this.labels.get(card.source.id)
      if (!node) continue
      const { x, y, visible } = this.scene.projectCard(card)
      node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translateX(-50%)`
      node.style.opacity = visible ? '1' : '0'
    }
  }
}
