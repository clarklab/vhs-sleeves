import { describe, expect, it } from 'vitest'
import { titleFromPath } from '../src/sleeves/discover'

describe('titleFromPath', () => {
  it('reads a plain filename', () => {
    expect(titleFromPath('../../sleeves/idiocracy.pdf')).toBe('Idiocracy')
  })

  it('turns separators into spaces and title-cases words', () => {
    expect(titleFromPath('/sleeves/the-thing_1982.pdf')).toBe('The Thing 1982')
  })

  it('leaves all-caps words alone', () => {
    expect(titleFromPath('sleeves/VHS-2025-01-29.pdf')).toBe('VHS 2025 01 29')
  })

  it('is case-insensitive about the extension', () => {
    expect(titleFromPath('sleeves/Robocop.PDF')).toBe('Robocop')
  })

  it('collapses runs of separators', () => {
    expect(titleFromPath('sleeves/back__to--the_future.pdf')).toBe('Back To The Future')
  })
})
