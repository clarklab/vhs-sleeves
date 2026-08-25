import { Group, Mesh, MeshStandardMaterial } from 'three'
import { BOX } from '../sleeves/dieline'
import type { SleeveSource } from '../sleeves/discover'
import { SleeveArtwork, loadArtwork } from '../sleeves/panels'
import { Cassette } from './Cassette'
import { SleeveBox } from './SleeveBox'

export type CardState = 'loading' | 'ready' | 'failed' | 'awaiting'

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * One item in the library: its sleeve, its tape, and the animation state that
 * ties them together. Everything about a single sleeve lives here; the scene
 * only positions cards and tells them when they are focused.
 */
export class SleeveCard extends Group {
  readonly source: SleeveSource
  state: CardState = 'loading'
  error: string | null = null

  private box: SleeveBox
  private cassette: Cassette
  private artwork: SleeveArtwork | null = null

  private insertTarget = 0
  private insertElapsed = 0
  private insertFrom = 0
  private insertDuration = 1.25
  private idleSpin = true
  private dim = 0
  private dimTarget = 0

  constructor(source: SleeveSource) {
    super()
    this.source = source
    this.name = source.id

    this.box = new SleeveBox(null)
    this.add(this.box)

    this.cassette = new Cassette()
    // The hinge chain hangs the box body behind the front panel (z 0 → -depth),
    // so the tape rides down the middle of that, not in front of the artwork.
    this.cassette.position.z = -BOX.depth / 2
    this.cassette.setInsertion(0)
    this.add(this.cassette)

    // Everything in the card is pickable as the card itself.
    this.traverse((child) => {
      if (child instanceof Mesh) child.userData.cardId = source.id
    })
  }

  async load(): Promise<void> {
    // A registered sleeve with no PDF yet is a normal state, not a failure — it
    // keeps a placeholder box on the shelf so its owner has somewhere to submit.
    if (!this.source.url) {
      this.state = 'awaiting'
      return
    }
    try {
      const artwork = await loadArtwork(this.source.url)
      this.artwork = artwork
      this.swapBox(new SleeveBox(artwork.textures, artwork.interior))
      this.state = 'ready'
    } catch (cause) {
      this.state = 'failed'
      this.error = cause instanceof Error ? cause.message : String(cause)
      console.error(`[sleeve] ${this.source.id} failed to load`, cause)
    }
  }

  private swapBox(next: SleeveBox): void {
    const fold = this.box.getFold()
    this.remove(this.box)
    this.box.dispose()
    this.box = next
    this.box.setFold(fold)
    this.add(next)
    next.traverse((child) => {
      if (child instanceof Mesh) child.userData.cardId = this.source.id
    })
  }

  setFold(t: number): void {
    this.box.setFold(t)
    // A tape cannot sit inside a sleeve that isn't a sleeve yet.
    if (t < 0.98 && this.insertTarget > 0) this.playEject()
  }

  getFold(): number {
    return this.box.getFold()
  }

  playInsert(): void {
    this.beginInsertion(1, 1.25)
  }

  playEject(): void {
    this.beginInsertion(0, 0.7)
  }

  toggleCassette(): void {
    if (this.insertTarget > 0.5) this.playEject()
    else this.playInsert()
  }

  get cassetteIsIn(): boolean {
    return this.insertTarget > 0.5
  }

  private beginInsertion(target: number, duration: number): void {
    this.insertFrom = this.cassette.getInsertion()
    this.insertTarget = target
    this.insertElapsed = 0
    this.insertDuration = duration
  }

  setFocused(focused: boolean): void {
    this.idleSpin = !focused
    if (!focused) {
      this.rotation.set(0, this.rotation.y, 0)
    }
  }

  /** 0 = full strength, 1 = pushed back into the dark. */
  setDimTarget(amount: number): void {
    this.dimTarget = amount
  }

  private applyDim(): void {
    const opacity = 1 - this.dim
    const seen = new Set<MeshStandardMaterial>()
    this.traverse((child) => {
      if (!(child instanceof Mesh)) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials as MeshStandardMaterial[]) {
        if (seen.has(material)) continue
        seen.add(material)
        const wantsBlending = this.dim > 0.001
        // Flipping `transparent` changes the shader program, so it only takes
        // effect with needsUpdate — but setting that every frame would recompile
        // on every tick, so only flag it on the actual transition.
        if (material.transparent !== wantsBlending) {
          material.transparent = wantsBlending
          material.needsUpdate = true
        }
        material.opacity = opacity
        material.depthWrite = this.dim < 0.5
      }
    })
    this.visible = opacity > 0.02
  }

  resetOrientation(): void {
    this.rotation.set(0, 0, 0)
  }

  update(delta: number): void {
    if (this.insertElapsed < this.insertDuration) {
      this.insertElapsed = Math.min(this.insertDuration, this.insertElapsed + delta)
      const t = easeOutCubic(this.insertElapsed / this.insertDuration)
      this.cassette.setInsertion(this.insertFrom + (this.insertTarget - this.insertFrom) * t)
    }
    if (this.idleSpin) {
      this.rotation.y += delta * 0.28
    }
    if (Math.abs(this.dimTarget - this.dim) > 0.002) {
      this.dim += (this.dimTarget - this.dim) * Math.min(1, delta * 6)
      this.applyDim()
    }
  }

  dispose(): void {
    this.box.dispose()
    this.cassette.dispose()
    this.artwork?.dispose()
  }
}
