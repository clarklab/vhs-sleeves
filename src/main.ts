import './style.css'
import { discoverSleeves } from './sleeves/discover'
import { LibraryScene } from './three/LibraryScene'
import { Overlay } from './ui/overlay'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const scene = new LibraryScene(canvas)
const overlay = new Overlay(scene)

// The camera frames a focused sleeve clear of the detail panel; only the overlay
// knows how much of the viewport that panel is currently covering.
scene.reservedRightPx = () => overlay.detailInsetRightPx
scene.reservedBottomPx = () => overlay.detailInsetBottomPx

const cards = scene.addSleeves(discoverSleeves())
overlay.registerCards(cards)

// Opening a sleeve plays the tape in. The fold slider stays available afterwards.
scene.onFocusChange((card) => {
  if (card) card.playInsert()
})

scene.start(() => overlay.tick(cards))

// Each sleeve resolves on its own, so the grid is interactive immediately and
// boxes fill in as their PDFs finish. One bad PDF costs one box, not the library.
for (const card of cards) {
  card.load().then(() => {
    overlay.markCard(card)
    overlay.updateCount(cards)
    if (scene.focused === card) card.playInsert()
  })
}
