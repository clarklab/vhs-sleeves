import { Box3, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BOX, STOCK_THICKNESS } from '../src/sleeves/dieline'
import { SleeveBox } from '../src/three/SleeveBox'

/** World-space centre of a panel mesh. */
const centreOf = (object: any): Vector3 => {
  object.updateWorldMatrix(true, true)
  return object.getWorldPosition(new Vector3())
}

describe('SleeveBox fold', () => {
  it('lays the panels out in a plane at fold 0', () => {
    const box = new SleeveBox(null)
    box.setFold(0)
    box.updateMatrixWorld(true)

    const size = new Box3().setFromObject(box).getSize(new Vector3())
    // Flat: as wide as all four panels laid side by side, and no real depth
    // beyond the stock itself (the tuck flap sits one thickness behind).
    expect(size.x).toBeCloseTo(2 * BOX.width + 2 * BOX.depth, 3)
    expect(size.z).toBeLessThanOrEqual(2 * STOCK_THICKNESS + 1e-6)
  })

  it('closes into a VHS-sized tube at fold 1', () => {
    const box = new SleeveBox(null)
    box.setFold(1)
    box.updateMatrixWorld(true)

    const size = new Box3().setFromObject(box).getSize(new Vector3())
    // Outer dimensions are the panel sizes plus the card stock wrapped around
    // them — half a thickness at each face the fold actually reaches.
    expect(size.x).toBeCloseTo(BOX.width + STOCK_THICKNESS, 2)
    expect(size.y).toBeGreaterThanOrEqual(BOX.height)
    expect(size.y).toBeLessThanOrEqual(BOX.height + STOCK_THICKNESS)
    expect(size.z).toBeGreaterThan(BOX.depth)
    expect(size.z).toBeLessThan(BOX.depth + 4 * STOCK_THICKNESS)
  })

  it('brings the two free edges together — the tube actually seals', () => {
    const box = new SleeveBox(null)
    box.setFold(1)
    box.updateMatrixWorld(true)

    // The left panel and the back panel are the ends of the hinge chain; folded,
    // they must end up on the same face of the box rather than gaping or crossing.
    const left = centreOf(box.userData.seamA)
    const back = centreOf(box.userData.seamB)

    expect(left.z).toBeCloseTo(-BOX.depth / 2, 1)
    expect(back.z).toBeCloseTo(-BOX.depth, 1)
    expect(Math.abs(back.x)).toBeLessThan(0.05)
  })

  it('clamps out-of-range fold values', () => {
    const box = new SleeveBox(null)
    box.setFold(-3)
    expect(box.getFold()).toBe(0)
    box.setFold(9)
    expect(box.getFold()).toBe(1)
  })
})
