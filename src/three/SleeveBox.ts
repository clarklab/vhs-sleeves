import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
} from 'three'
import { BOX, STOCK_THICKNESS } from '../sleeves/dieline'
import type { PanelTextures } from '../sleeves/panels'

const HALF_PI = Math.PI / 2

/**
 * The sleeve is a chain of hinged panels, not a box with a fold animation bolted on.
 *
 *   front (root)
 *     ├─ leftHinge  ─ left
 *     ├─ rightHinge ─ right ─ backHinge ─ back
 *     └─ hoodHinge  ─ hoodTop ─ tuckHinge ─ hoodTuck
 *
 * At fold 0 every hinge is flat and the panels lie in a plane, laid out exactly as
 * printed. At fold 1 every hinge is at 90° and the same geometry has closed into a
 * 10.45 × 18.89 × 2.49cm tube — open at the bottom, hood tucked down the back.
 * One number drives all of it.
 */
export class SleeveBox extends Group {
  private readonly hinges: Object3D[] = []
  private readonly materials: MeshStandardMaterial[] = []
  private fold = 1

  constructor(textures: PanelTextures | null, interiorColor = '#1a1a1d') {
    super()

    const { width, height, depth, hoodWidth, hoodHeight } = BOX
    const interior = new Color(interiorColor)

    // Side panels are drawn at their true printed widths so the flat state is
    // faithful; the meshes use the closing depth so the tube seals at fold 1.
    const leftWidth = depth
    const rightWidth = depth

    const front = this.panel(width, height, textures?.front, interior)
    this.add(front)

    // ── left: hinges backwards off the front's left edge ────────────────────
    const leftHinge = new Group()
    leftHinge.position.x = -width / 2
    front.add(leftHinge)
    const left = this.panel(leftWidth, height, textures?.left, interior)
    left.position.x = -leftWidth / 2
    leftHinge.add(left)
    this.hinges.push(leftHinge)

    // ── right, then back: the long way around the tube ──────────────────────
    const rightHinge = new Group()
    rightHinge.position.x = width / 2
    front.add(rightHinge)
    const right = this.panel(rightWidth, height, textures?.right, interior)
    right.position.x = rightWidth / 2
    rightHinge.add(right)
    this.hinges.push(rightHinge)

    const backHinge = new Group()
    backHinge.position.x = rightWidth / 2
    right.add(backHinge)
    const back = this.panel(width, height, textures?.back, interior)
    back.position.x = width / 2
    backHinge.add(back)
    this.hinges.push(backHinge)

    // ── hood: over the top, then tucked down the back ───────────────────────
    const hoodTopDepth = depth
    const hoodTuckDepth = Math.max(0.1, hoodHeight - depth)

    const hoodHinge = new Group()
    hoodHinge.position.y = height / 2
    front.add(hoodHinge)
    const hoodTop = this.panel(
      hoodWidth,
      hoodTopDepth,
      textures?.hood,
      interior,
      { v0: 0, v1: hoodTopDepth / hoodHeight },
    )
    hoodTop.position.y = hoodTopDepth / 2
    hoodHinge.add(hoodTop)
    this.hinges.push(hoodHinge)

    const tuckHinge = new Group()
    tuckHinge.position.y = hoodTopDepth / 2
    hoodTop.add(tuckHinge)
    const hoodTuck = this.panel(
      hoodWidth,
      hoodTuckDepth,
      textures?.hood,
      interior,
      { v0: hoodTopDepth / hoodHeight, v1: 1 },
    )
    hoodTuck.position.y = hoodTuckDepth / 2
    // A tuck flap goes inside the box. One stock thickness clear of the back
    // panel, so the two don't z-fight where they overlap.
    hoodTuck.position.z = -STOCK_THICKNESS
    tuckHinge.add(hoodTuck)
    this.hinges.push(tuckHinge)

    // Named handles so tests can assert the tube actually closes.
    this.userData.seamA = left
    this.userData.seamB = back

    this.setFold(1)
  }

  /**
   * One panel of card stock: a thin box whose outward face carries the artwork
   * and whose other five faces are the unprinted inside of the card.
   */
  private panel(
    width: number,
    height: number,
    texture: Texture | undefined,
    interior: Color,
    uv?: { v0: number; v1: number },
  ): Mesh {
    const geometry = new BoxGeometry(width, height, STOCK_THICKNESS)

    if (uv) {
      // Remap the +Z face's V range so the hood's two segments sample different
      // horizontal bands of the same hood texture.
      const attr = geometry.attributes.uv
      const face = 16 // +Z face vertices start here in BoxGeometry's ordering
      for (let i = face; i < face + 4; i++) {
        const v = attr.getY(i)
        attr.setY(i, 1 - (uv.v0 + v * (uv.v1 - uv.v0)))
      }
      attr.needsUpdate = true
    }

    const inside = new MeshStandardMaterial({ color: interior, roughness: 0.95, metalness: 0 })
    const outside = texture
      ? new MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0.02 })
      : new MeshStandardMaterial({ color: '#3a3a40', roughness: 0.8 })

    this.materials.push(inside, outside)
    // BoxGeometry material order: +x, -x, +y, -y, +z, -z
    const mesh = new Mesh(geometry, [inside, inside, inside, inside, outside, inside])
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  /** 0 = flat as printed, 1 = closed box. */
  setFold(t: number): void {
    this.fold = Math.min(1, Math.max(0, t))
    const angle = this.fold * HALF_PI
    // Every panel folds away from the viewer, so the front artwork stays facing
    // +Z and the body of the box closes up behind it.
    this.hinges[0].rotation.y = -angle // left
    this.hinges[1].rotation.y = angle // right
    this.hinges[2].rotation.y = angle // back, continuing around the tube
    this.hinges[3].rotation.x = -angle // hood, over the top opening
    this.hinges[4].rotation.x = -angle // tuck, down the inside of the back
  }

  getFold(): number {
    return this.fold
  }

  dispose(): void {
    this.traverse((child) => {
      if (child instanceof Mesh) child.geometry.dispose()
    })
    for (const material of this.materials) material.dispose()
  }
}
