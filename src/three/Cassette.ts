import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RingGeometry,
} from 'three'

/** Real VHS: 187 × 103 × 25mm. Trimmed a hair so it visibly clears the sleeve. */
export const CASSETTE = { width: 10.1, height: 18.5, depth: 2.3 }

/**
 * A generic black VHS cassette, built procedurally — no asset files.
 *
 * Orientation matches how a tape actually sits in its sleeve: the 187mm dimension
 * runs vertically (the direction it slides), the window faces the front panel, and
 * the hinged flap runs down the right-hand edge.
 */
export class Cassette extends Group {
  private readonly disposables: { dispose(): void }[] = []
  private travel = 0

  constructor() {
    super()

    const shellMaterial = new MeshPhysicalMaterial({
      color: '#16161a',
      roughness: 0.42,
      metalness: 0.0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.5,
    })
    this.track(shellMaterial)

    const shell = new Mesh(
      new BoxGeometry(CASSETTE.width, CASSETTE.height, CASSETTE.depth),
      shellMaterial,
    )
    shell.castShadow = true
    this.track(shell.geometry)
    this.add(shell)

    // ── reels, seen through the window ──────────────────────────────────────
    const z = CASSETTE.depth / 2
    const hubY = CASSETTE.height * 0.17

    const tapeMaterial = new MeshStandardMaterial({ color: '#0b0a0c', roughness: 0.35 })
    const hubMaterial = new MeshStandardMaterial({ color: '#d8d5cf', roughness: 0.7 })
    this.track(tapeMaterial, hubMaterial)

    for (const sign of [1, -1]) {
      // Wound tape: a fat ring, one spool fuller than the other.
      const wound = sign > 0 ? 2.05 : 1.45
      const spool = new Mesh(new RingGeometry(0.62, wound, 48), tapeMaterial)
      spool.position.set(0, hubY * sign, z - 0.06)
      this.track(spool.geometry)
      this.add(spool)

      const hub = new Mesh(new CylinderGeometry(0.62, 0.62, 0.12, 32), hubMaterial)
      hub.rotation.x = Math.PI / 2
      hub.position.set(0, hubY * sign, z - 0.1)
      this.track(hub.geometry)
      this.add(hub)

      const cap = new Mesh(new CircleGeometry(0.34, 24), tapeMaterial)
      cap.position.set(0, hubY * sign, z - 0.03)
      this.track(cap.geometry)
      this.add(cap)
    }

    const windowMaterial = new MeshPhysicalMaterial({
      color: '#1b1c22',
      roughness: 0.06,
      metalness: 0,
      transmission: 0.82,
      thickness: 0.2,
      ior: 1.5,
    })
    this.track(windowMaterial)
    const windowPane = new Mesh(
      new BoxGeometry(CASSETTE.width * 0.72, CASSETTE.height * 0.52, 0.05),
      windowMaterial,
    )
    windowPane.position.set(0, 0, z + 0.005)
    this.track(windowPane.geometry)
    this.add(windowPane)

    // ── labels ──────────────────────────────────────────────────────────────
    const labelMaterial = new MeshStandardMaterial({ color: '#e8e4da', roughness: 0.9 })
    this.track(labelMaterial)

    const faceLabel = new Mesh(
      new BoxGeometry(CASSETTE.width * 0.82, CASSETTE.height * 0.17, 0.02),
      labelMaterial,
    )
    faceLabel.position.set(0, -CASSETTE.height * 0.37, z + 0.01)
    this.track(faceLabel.geometry)
    this.add(faceLabel)

    const spineLabel = new Mesh(
      new BoxGeometry(0.02, CASSETTE.height * 0.78, CASSETTE.depth * 0.62),
      labelMaterial,
    )
    spineLabel.position.set(-CASSETTE.width / 2 - 0.005, 0, 0)
    this.track(spineLabel.geometry)
    this.add(spineLabel)

    // ── flap down the right edge ────────────────────────────────────────────
    const flapMaterial = new MeshPhysicalMaterial({
      color: '#101014',
      roughness: 0.3,
      clearcoat: 0.5,
    })
    this.track(flapMaterial)
    const flap = new Mesh(
      new BoxGeometry(0.16, CASSETTE.height * 0.94, CASSETTE.depth * 0.96),
      flapMaterial,
    )
    flap.position.set(CASSETTE.width / 2 + 0.06, 0, 0)
    flap.castShadow = true
    this.track(flap.geometry)
    this.add(flap)
  }

  /**
   * 0 = fully out and clear of the sleeve, 1 = seated inside.
   * The sleeve is open at the bottom, so the tape rises into it.
   */
  setInsertion(t: number): void {
    this.travel = Math.min(1, Math.max(0, t))
    // Written as (t - 1) rather than -(1 - t) so a seated tape lands on exactly
    // 0 instead of -0.
    this.position.y = (this.travel - 1) * (CASSETTE.height + 1.6)
    this.visible = this.travel > 0.001
  }

  getInsertion(): number {
    return this.travel
  }

  private track(...items: { dispose(): void }[]): void {
    this.disposables.push(...items)
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose()
  }
}
