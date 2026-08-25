import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PMREMGenerator,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { BOX } from '../sleeves/dieline'
import type { SleeveSource } from '../sleeves/discover'
import { SleeveCard } from './SleeveCard'

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

const GAP = 4.5
const FLY_DURATION = 0.9

interface CameraFlight {
  fromPos: Vector3
  toPos: Vector3
  fromTarget: Vector3
  toTarget: Vector3
  elapsed: number
}

export class LibraryScene {
  readonly cards: SleeveCard[] = []
  focused: SleeveCard | null = null

  private focusListeners: ((card: SleeveCard | null) => void)[] = []

  private renderer: WebGLRenderer
  private scene: Scene
  private camera: PerspectiveCamera
  private controls: OrbitControls
  private clock = new Clock()
  private raycaster = new Raycaster()
  private pointer = new Vector2()
  private pointerDownAt = new Vector2()
  private flight: CameraFlight | null = null
  private gridHome = { position: new Vector3(), target: new Vector3() }

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.toneMapping = ACESFilmicToneMapping
    // Printed artwork is already the brightest thing in frame. Overlight it and
    // ACES rolls the highlights off to a washed-out cream — the yellows go pale
    // and a flat colour reads as white. Keep the total budget close to 1.0.
    this.renderer.toneMappingExposure = 0.98

    this.scene = new Scene()
    this.scene.background = new Color('#0b0b0f')
    this.scene.fog = new Fog('#0b0b0f', 60, 150)

    // RoomEnvironment gives the card stock and cassette plastic something to
    // reflect without shipping an HDRI.
    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.34
    pmrem.dispose()

    this.scene.add(new HemisphereLight('#cfd6ff', '#141118', 0.28))
    const key = new DirectionalLight('#fff4e6', 1.15)
    key.position.set(6, 12, 14)
    this.scene.add(key)
    const rim = new DirectionalLight('#7f9cff', 0.42)
    rim.position.set(-9, 4, -8)
    this.scene.add(rim)

    this.camera = new PerspectiveCamera(42, 1, 0.1, 500)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = false
    this.controls.enabled = false
    this.controls.minDistance = BOX.height * 0.75
    this.controls.maxDistance = BOX.height * 3.5

    canvas.addEventListener('pointerdown', this.handlePointerDown)
    canvas.addEventListener('pointerup', this.handlePointerUp)
    window.addEventListener('resize', this.resize)
    this.resize()
  }

  onFocusChange(listener: (card: SleeveCard | null) => void): void {
    this.focusListeners.push(listener)
  }

  private emitFocus(card: SleeveCard | null): void {
    for (const listener of this.focusListeners) listener(card)
  }

  addSleeves(sources: SleeveSource[]): SleeveCard[] {
    for (const source of sources) {
      const card = new SleeveCard(source)
      this.cards.push(card)
      this.scene.add(card)
    }
    this.layout()
    return this.cards
  }

  /** Arrange cards in a grid sized to keep the whole shelf in frame. */
  layout(): void {
    const n = this.cards.length
    if (n === 0) return
    const columns = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 1.6))))
    const rows = Math.ceil(n / columns)
    const stepX = BOX.width + GAP
    const stepY = BOX.height + GAP * 0.8

    this.cards.forEach((card, i) => {
      const col = i % columns
      const row = Math.floor(i / columns)
      card.position.set(
        (col - (columns - 1) / 2) * stepX,
        ((rows - 1) / 2 - row) * stepY,
        0,
      )
    })

    const spanX = columns * stepX
    const spanY = rows * stepY
    const fov = (this.camera.fov * Math.PI) / 180
    const distY = spanY / 2 / Math.tan(fov / 2)
    const distX = spanX / 2 / Math.tan(fov / 2) / Math.max(this.camera.aspect, 0.4)
    const distance = Math.max(distX, distY) * 1.18 + BOX.depth * 4

    // OrbitControls clamps the camera radius on every update(), including while
    // it is disabled, so the grid's framing distance has to be inside the allowed
    // range — otherwise the shelf gets silently cropped on a tall window, or as
    // soon as enough sleeves push the grid back past the focus-mode limit.
    this.controls.maxDistance = Math.max(distance * 1.15, BOX.height * 3.5)

    this.gridHome.position.set(0, 0, distance)
    this.gridHome.target.set(0, 0, 0)
    if (!this.focused && !this.flight) {
      this.camera.position.copy(this.gridHome.position)
      this.controls.target.copy(this.gridHome.target)
    }
  }

  focus(card: SleeveCard): void {
    if (this.focused === card) return
    this.focused?.setFocused(false)
    this.focused = card
    card.setFocused(true)
    card.resetOrientation()

    for (const other of this.cards) other.setDimTarget(other === card ? 0 : 0.9)
    const { position, target } = this.framingFor(card)
    this.flyTo(position, target)
    this.emitFocus(card)
  }

  /**
   * Where the camera sits to show one sleeve.
   *
   * Depends on the viewport aspect and on how much of the right edge the detail
   * panel covers, so it is recomputed on resize rather than fixed at focus time.
   */
  private framingFor(card: SleeveCard): { position: Vector3; target: Vector3 } {
    // Fill ~78% of the viewport height.
    const fov = (this.camera.fov * Math.PI) / 180
    const distance = BOX.height / 2 / (0.78 * Math.tan(fov / 2))

    // Nudging the look-at point right slides the box left by the same amount, so
    // it sits centred in the space actually visible beside the panel.
    const inset = this.reservedRightPx()
    const visibleWidth = 2 * distance * Math.tan(fov / 2) * this.camera.aspect
    const shift = this.canvas.clientWidth
      ? (inset / 2 / this.canvas.clientWidth) * visibleWidth
      : 0

    const target = card.position.clone().add(new Vector3(shift, -BOX.height * 0.04, 0))
    return {
      position: target.clone().add(new Vector3(distance * 0.3, distance * 0.12, distance * 0.95)),
      target,
    }
  }

  /** Supplied by the overlay — how much of the right edge the panel occupies. */
  reservedRightPx: () => number = () => 0

  unfocus(): void {
    if (!this.focused) return
    const card = this.focused
    card.playEject()
    card.setFold(1)
    card.setFocused(false)
    for (const other of this.cards) other.setDimTarget(0)
    this.focused = null
    this.controls.enabled = false
    this.flyTo(this.gridHome.position.clone(), this.gridHome.target.clone())
    this.emitFocus(null)
  }

  private flyTo(position: Vector3, target: Vector3): void {
    this.controls.enabled = false
    this.flight = {
      fromPos: this.camera.position.clone(),
      toPos: position,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      elapsed: 0,
    }
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.pointerDownAt.set(event.clientX, event.clientY)
  }

  private handlePointerUp = (event: PointerEvent) => {
    // Ignore the pointerup that ends an orbit drag.
    if (this.pointerDownAt.distanceTo(new Vector2(event.clientX, event.clientY)) > 6) return
    if (this.focused) return

    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects(this.cards, true)[0]
    const cardId = hit?.object.userData.cardId
    const card = this.cards.find((c) => c.source.id === cardId)
    if (card) this.focus(card)
  }

  /** Project a card's centre to screen space, for the HTML labels. */
  projectCard(card: SleeveCard): { x: number; y: number; visible: boolean } {
    const point = card.position.clone().add(new Vector3(0, -BOX.height / 2 - 1.2, 0))
    point.project(this.camera)
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: ((point.x + 1) / 2) * rect.width,
      y: ((1 - point.y) / 2) * rect.height,
      visible: point.z < 1,
    }
  }

  resize = () => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.layout()

    // Framing depends on aspect and on the panel's width, both of which just
    // changed — without this a focused sleeve slides out of frame on resize.
    if (this.focused) {
      const { position, target } = this.framingFor(this.focused)
      this.camera.position.copy(position)
      this.controls.target.copy(target)
      this.flight = null
    }
  }

  start(onFrame?: (delta: number) => void): void {
    this.renderer.setAnimationLoop(() => {
      const delta = Math.min(this.clock.getDelta(), 0.05)

      if (this.flight) {
        this.flight.elapsed += delta
        const t = easeInOutCubic(Math.min(1, this.flight.elapsed / FLY_DURATION))
        this.camera.position.lerpVectors(this.flight.fromPos, this.flight.toPos, t)
        this.controls.target.lerpVectors(this.flight.fromTarget, this.flight.toTarget, t)
        if (t >= 1) {
          this.flight = null
          this.controls.enabled = this.focused !== null
        }
      }

      for (const card of this.cards) card.update(delta)
      this.controls.update()
      onFrame?.(delta)
      this.renderer.render(this.scene, this.camera)
    })
  }
}
