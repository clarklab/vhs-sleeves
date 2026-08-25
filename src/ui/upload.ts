import { MAX_UPLOAD_BYTES, toBase64, validateSleevePdf } from '../sleeves/validate'
import type { SleeveSource } from '../sleeves/discover'

const ENDPOINT = '/api/submit-sleeve'

interface SubmitResponse {
  ok?: boolean
  commitSha?: string
  commitUrl?: string
  error?: string
}

/**
 * Submit an edited sleeve back to the project.
 *
 * The upload itself is the easy part; the states around it are the point. A file
 * is checked against the die-line before it leaves the browser, the bar tracks
 * real bytes rather than a fake timer, and the accepted screen is explicit that
 * publishing takes a couple of minutes — otherwise the first thing everyone does
 * is re-upload because nothing visibly changed.
 */
export class UploadPanel {
  readonly element: HTMLElement
  private sleeve: SleeveSource | null = null
  private fileInput: HTMLInputElement
  private nameInput: HTMLInputElement
  private submitButton: HTMLButtonElement
  private status: HTMLElement
  private progress: HTMLElement
  private progressFill: HTMLElement
  private chosen: File | null = null
  private busy = false

  constructor(private onAccepted: (result: { commitSha?: string; commitUrl?: string }) => void) {
    this.element = document.createElement('section')
    this.element.className = 'upload'
    this.element.innerHTML = `
      <h3>Submit an edit</h3>
      <label class="dropzone" tabindex="0">
        <input type="file" accept="application/pdf,.pdf" hidden />
        <span class="dropzone-label">Choose a PDF or drop it here</span>
      </label>
      <div class="fields">
        <input class="who" type="text" placeholder="Your name (optional)" autocomplete="name" />
      </div>
      <p class="status" role="status"></p>
      <div class="progress" hidden><span class="progress-fill"></span></div>
      <button class="submit" type="button" disabled>Upload &amp; publish</button>
    `

    const dropzone = this.element.querySelector<HTMLElement>('.dropzone')!
    this.fileInput = this.element.querySelector('input[type=file]')!
    this.nameInput = this.element.querySelector('.who')!
    this.submitButton = this.element.querySelector('.submit')!
    this.status = this.element.querySelector('.status')!
    this.progress = this.element.querySelector('.progress')!
    this.progressFill = this.element.querySelector('.progress-fill')!

    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0]
      if (file) void this.consider(file)
    })

    for (const event of ['dragenter', 'dragover'] as const) {
      dropzone.addEventListener(event, (e) => {
        e.preventDefault()
        dropzone.classList.add('over')
      })
    }
    for (const event of ['dragleave', 'drop'] as const) {
      dropzone.addEventListener(event, () => dropzone.classList.remove('over'))
    }
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault()
      const file = e.dataTransfer?.files?.[0]
      if (file) void this.consider(file)
    })

    this.submitButton.addEventListener('click', () => void this.send())
  }

  setSleeve(sleeve: SleeveSource): void {
    this.sleeve = sleeve
    this.reset()
  }

  private reset(): void {
    this.chosen = null
    this.busy = false
    this.fileInput.value = ''
    this.progress.hidden = true
    this.progressFill.style.width = '0%'
    this.setStatus('', null)
    this.element.querySelector('.dropzone-label')!.textContent = 'Choose a PDF or drop it here'
    this.refreshButton()
  }

  private setStatus(message: string, tone: 'ok' | 'error' | 'working' | null): void {
    this.status.textContent = message
    this.status.dataset.tone = tone ?? ''
  }

  private refreshButton(): void {
    this.submitButton.disabled = this.busy || !this.chosen
  }

  /** Validate locally first — a bad template should never cost a round trip. */
  private async consider(file: File): Promise<void> {
    this.chosen = null
    this.refreshButton()
    this.setStatus('Checking the PDF…', 'working')

    const result = await validateSleevePdf(file)
    if (!result.ok) {
      this.setStatus(result.message, 'error')
      return
    }

    this.chosen = file
    const kb = Math.round(file.size / 1024)
    this.element.querySelector('.dropzone-label')!.textContent = `${file.name} · ${kb}KB`
    this.setStatus('Page size matches the template. Ready to send.', 'ok')
    this.refreshButton()
  }

  private async send(): Promise<void> {
    if (!this.chosen || !this.sleeve) return
    this.busy = true
    this.refreshButton()
    this.progress.hidden = false
    this.progressFill.style.width = '0%'
    this.setStatus('Uploading…', 'working')

    let payload: string
    try {
      payload = toBase64(new Uint8Array(await this.chosen.arrayBuffer()))
    } catch {
      this.busy = false
      this.setStatus('That file could not be read.', 'error')
      this.refreshButton()
      return
    }

    if (payload.length > MAX_UPLOAD_BYTES * 1.4) {
      this.busy = false
      this.setStatus('That file is too large to send.', 'error')
      this.refreshButton()
      return
    }

    try {
      const result = await this.post({
        sleeveId: this.sleeve.id,
        submittedBy: this.nameInput.value,
        contentBase64: payload,
      })
      this.setStatus('', null)
      this.progress.hidden = true
      this.onAccepted(result)
      this.reset()
    } catch (cause) {
      this.busy = false
      this.progress.hidden = true
      this.setStatus(cause instanceof Error ? cause.message : String(cause), 'error')
      this.refreshButton()
    }
  }

  /**
   * XHR rather than fetch: fetch cannot report upload progress, and a bar that
   * only animates on a guess is worse than no bar.
   */
  private post(body: Record<string, string>): Promise<SubmitResponse> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open('POST', ENDPOINT)
      request.setRequestHeader('content-type', 'application/json')

      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return
        const percent = Math.round((event.loaded / event.total) * 100)
        this.progressFill.style.width = `${percent}%`
        this.setStatus(`Uploading… ${percent}%`, 'working')
      })

      request.upload.addEventListener('load', () => {
        this.progressFill.style.width = '100%'
        this.setStatus('Handing off to GitHub…', 'working')
      })

      request.addEventListener('load', () => {
        let parsed: SubmitResponse = {}
        try {
          parsed = JSON.parse(request.responseText) as SubmitResponse
        } catch {
          reject(new Error(`Server returned ${request.status} with an unreadable body.`))
          return
        }
        if (request.status >= 200 && request.status < 300 && parsed.ok) resolve(parsed)
        else reject(new Error(parsed.error || `Upload failed (${request.status}).`))
      })

      request.addEventListener('error', () =>
        reject(new Error('Network error — check your connection and try again.')),
      )
      request.addEventListener('abort', () => reject(new Error('Upload cancelled.')))

      request.send(JSON.stringify(body))
    })
  }
}
