import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  Texture,
} from 'three'
import { BOX, STOCK_THICKNESS, THUMB_NOTCH_RADIUS } from '../sleeves/dieline'
import type { PanelTextures } from '../sleeves/panels'

const HALF_PI = Math.PI / 2

/**
 * A panel with a semicircular thumb notch bitten out of its bottom edge.
 *
 * BoxGeometry can't express the cut, so the outline is extruded from a Shape.
 * That costs two things which have to be put back by hand: ExtrudeGeometry puts
 * the front and back faces in one material group, and its UVs are raw model
 * coordinates rather than 0–1.
 */
function notchedPanelGeometry(width: number, height: number, radius: number): BufferGeometry {
  const halfW = width / 2
  const halfH = height / 2
  const r = Math.min(radius, halfW * 0.92)

  const shape = new Shape()
  shape.moveTo(-halfW, -halfH)
  shape.lineTo(-r, -halfH)
  // PI → 0 clockwise arcs up over the top of the circle, biting into the panel.
  shape.absarc(0, -halfH, r, Math.PI, 0, true)
  shape.lineTo(halfW, -halfH)
  shape.lineTo(halfW, halfH)
  shape.lineTo(-halfW, halfH)
  shape.closePath()

  const geometry = new ExtrudeGeometry(shape, {
    depth: STOCK_THICKNESS,
    bevelEnabled: false,
    curveSegments: 24,
  })
  // Extrusion runs 0 → depth; BoxGeometry straddles zero, and the hinge maths
  // assumes the latter.
  geometry.translate(0, 0, -STOCK_THICKNESS / 2)

  remapPanelUVs(geometry, width, height)
  splitFaceGroups(geometry)
  return geometry
}

/** Rewrite UVs to 0–1 across the panel, matching BoxGeometry's +Z convention. */
function remapPanelUVs(geometry: BufferGeometry, width: number, height: number): void {
  const position = geometry.attributes.position
  const uv = geometry.attributes.uv
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, (position.getX(i) + width / 2) / width, (position.getY(i) + height / 2) / height)
  }
  uv.needsUpdate = true
}

/**
 * ExtrudeGeometry hands back one group for both flat faces. Split it by facing
 * so the printed side can take the artwork and the inside stays unprinted.
 * Material order matches the BoxGeometry path: 0 = inside, 1 = outside.
 */
function splitFaceGroups(geometry: BufferGeometry): void {
  const normal = geometry.attributes.normal
  const materialFor = (i: number) => (normal.getZ(i) > 0.5 ? 1 : 0)

  geometry.clearGroups()
  let start = 0
  let current = materialFor(0)
  for (let i = 3; i < normal.count; i += 3) {
    const material = materialFor(i)
    if (material === current) continue
    geometry.addGroup(start, i - start, current)
    start = i
    current = material
  }
  geometry.addGroup(start, normal.count - start, current)
}


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
    const left = this.panel(
      leftWidth,
      height,
      textures?.left,
      interior,
      undefined,
      THUMB_NOTCH_RADIUS,
    )
    left.position.x = -leftWidth / 2
    leftHinge.add(left)
    this.hinges.push(leftHinge)

    // ── right, then back: the long way around the tube ──────────────────────
    const rightHinge = new Group()
    rightHinge.position.x = width / 2
    front.add(rightHinge)
    const right = this.panel(
      rightWidth,
      height,
      textures?.right,
      interior,
      undefined,
      THUMB_NOTCH_RADIUS,
    )
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
    notchRadius?: number,
  ): Mesh {
    const notched = notchRadius !== undefined
    const geometry = notched
      ? notchedPanelGeometry(width, height, notchRadius)
      : new BoxGeometry(width, height, STOCK_THICKNESS)

    if (uv && !notched) {
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
    // Both paths put the printed face last: BoxGeometry order is +x, -x, +y, -y,
    // +z, -z, and the notched geometry's groups are split to match 0/1.
    const mesh = new Mesh(
      geometry,
      notched ? [inside, outside] : [inside, inside, inside, inside, outside, inside],
    )
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
