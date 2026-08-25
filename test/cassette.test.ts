import { Box3, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BOX } from '../src/sleeves/dieline'
import { CASSETTE, Cassette } from '../src/three/Cassette'
import { SleeveBox } from '../src/three/SleeveBox'

describe('Cassette insertion', () => {
  it('sits home at the sleeve centre when fully inserted', () => {
    const tape = new Cassette()
    tape.setInsertion(1)
    expect(tape.position.y).toBe(0)
    expect(tape.visible).toBe(true)
  })

  it('clears the sleeve entirely when fully out', () => {
    const tape = new Cassette()
    tape.setInsertion(0)
    // Below the open bottom edge of the sleeve, not just peeking out of it.
    expect(tape.position.y + CASSETTE.height / 2).toBeLessThan(-BOX.height / 2)
    expect(tape.visible).toBe(false)
  })

  it('clamps out-of-range travel', () => {
    const tape = new Cassette()
    tape.setInsertion(4)
    expect(tape.getInsertion()).toBe(1)
    tape.setInsertion(-2)
    expect(tape.getInsertion()).toBe(0)
  })
})

describe('cassette fits the sleeve', () => {
  it('clears the folded box on all three axes', () => {
    // A real VHS is 187 × 103 × 25mm inside a 189 × 104.5 × 25mm slipcase, so
    // the clearances here are small by design — but they must not be negative.
    expect(CASSETTE.width).toBeLessThan(BOX.width)
    expect(CASSETTE.height).toBeLessThan(BOX.height)
    expect(CASSETTE.depth).toBeLessThan(BOX.depth)
  })

  it('rides inside the tube rather than in front of the artwork', () => {
    const box = new SleeveBox(null)
    box.setFold(1)
    box.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(box)

    // SleeveCard parks the tape here; it has to land within the box's depth.
    const tapeZ = -BOX.depth / 2
    const tape = new Cassette()
    tape.position.z = tapeZ
    tape.setInsertion(1)
    tape.updateMatrixWorld(true)
    const tapeBounds = new Box3().setFromObject(tape)

    expect(tapeBounds.min.z).toBeGreaterThan(bounds.min.z)
    expect(tapeBounds.max.z).toBeLessThan(bounds.max.z)
    // The window and labels stand slightly proud of the shell, so the bounds
    // centre sits a fraction of a millimetre forward of the nominal position.
    expect(tapeBounds.getCenter(new Vector3()).z).toBeCloseTo(tapeZ, 1)
  })
})
