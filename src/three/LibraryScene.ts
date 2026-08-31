import {
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  PMREMGenerator,
  PerspectiveCamera,
  Raycaster,
  NeutralToneMapping,
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

const mix = (from: number, to: number, t: number) => from + (to - from) * t

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
  private fog: Fog
  private gridHome = { position: new Vector3(), target: new Vector3() }

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    // ACES is a film-emulation curve: it desaturates on the way to white, which
    // is flattering on a photograph and wrong on printed artwork — it turned the
    // yellows to cream and the Clockmaster spiral to a pastel of itself. Neutral
    // (Khronos PBR Neutral) holds hue and saturation and only compresses the
    // extreme highlights, which is exactly what a colour proof wants.
    this.renderer.toneMapping = NeutralToneMapping
    this.renderer.toneMappingExposure = 1

    this.scene = new Scene()
    this.scene.background = new Color('#0b0b0f')
    this.fog = new Fog('#0b0b0f', 60, 150)
    this.scene.fog = this.fog

    // RoomEnvironment gives the card stock and cassette plastic something to
    // reflect without shipping an HDRI.
    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    // A room reflection on matte card reads as a grey sheen laid over the ink.
    this.scene.environmentIntensity = 0.08
    pmrem.dispose()

    // Every light is neutral white. The old rig lit one side warm and the other
    // cool, and a surface caught between two tinted lights loses its own colour
    // — the mix greys it out. Shape comes from direction and falloff instead.
    //
    // The total matters more than any one light. These sum to ~1.2x albedo on a
    // panel facing the key and ~0.7x on one turned away from it. Piling on more
    // was the original mistake: past 1.0 every channel saturates toward white,
    // and clipping to white IS desaturation — the old rig hit 2.8x, which turned
    // anything brighter than a mid-tone into paper.
    this.scene.add(new AmbientLight('#ffffff', 0.22))
    const key = new DirectionalLight('#ffffff', 0.5)
    key.position.set(5, 10, 14)
    this.scene.add(key)
    const fill = new DirectionalLight('#ffffff', 0.18)
    fill.position.set(-9, 3, -7)
    this.scene.add(fill)

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
    // A tall, narrow window can't hold three columns without the labels colliding.
    const columns =
      this.camera.aspect < 0.75
        ? Math.min(n, 2)
        : Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 1.6))))
    const rows = Math.ceil(n / columns)
    const stepX = BOX.width + GAP
    // Rows need clearance for two lines of label under each box.
    const stepY = BOX.height + GAP * 1.7

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
  private framingFor(
    card: SleeveCard,
    fold: number = card.getFold(),
  ): { position: Vector3; target: Vector3 } {
    const fov = (this.camera.fov * Math.PI) / 180
    const tan = Math.tan(fov / 2)
    const viewW = this.canvas.clientWidth || 1
    const viewH = this.canvas.clientHeight || 1

    // The panel covers the right edge on desktop and the bottom on mobile, so
    // the sleeve is framed into whatever rectangle is actually still visible.
    const insetRight = Math.min(this.reservedRightPx(), viewW * 0.6)
    const insetBottom = Math.min(this.reservedBottomPx(), viewH * 0.8)
    const bandW = Math.max(viewW - insetRight, 1)
    const bandH = Math.max(viewH - insetBottom, 1)

    // Unfolded, the sheet is two and a half times wider than the box and taller
    // by the hood, so the framing has to open up as the fold slider comes back.
    const spanW = mix(2 * BOX.width + 2 * BOX.depth, BOX.width, fold)
    const spanH = mix(BOX.height + BOX.hoodHeight, BOX.height, fold)

    // Fill ~78% of the visible band rather than 78% of the window — otherwise a
    // bottom sheet just parks the sleeve behind itself.
    const forHeight = (spanH * viewH) / (2 * tan * 0.78 * bandH)
    const forWidth = (spanW * viewW) / (2 * tan * this.camera.aspect * 0.84 * bandW)
    const distance = Math.max(forHeight, forWidth)

    // Looking right of the sleeve slides it left; looking below it slides it up.
    const worldW = 2 * distance * tan * this.camera.aspect
    const worldH = 2 * distance * tan
    const shiftX = (insetRight / 2 / viewW) * worldW
    const shiftY = (insetBottom / 2 / viewH) * worldH

    const target = card.position.clone().add(new Vector3(shiftX, -shiftY - BOX.height * 0.02, 0))
    this.controls.maxDistance = Math.max(this.controls.maxDistance, distance * 1.3)
    return {
      position: target.clone().add(new Vector3(distance * 0.3, distance * 0.12, distance * 0.95)),
      target,
    }
  }

  /**
   * Re-fit the framing after the fold changes, keeping whatever angle the viewer
   * has orbited to — only the distance and the look-at point move.
   */
  reframeForFold(): void {
    if (!this.focused) return
    const { position, target } = this.framingFor(this.focused)

    // Mid-flight, retarget the flight rather than ignoring the change — the
    // slider is reachable the moment a card opens, before the camera lands.
    if (this.flight) {
      this.flight.toPos.copy(position)
      this.flight.toTarget.copy(target)
      return
    }

    const radius = position.distanceTo(target)
    const direction = this.camera.position.clone().sub(this.controls.target)
    if (direction.lengthSq() < 1e-6) return
    direction.normalize()
    this.controls.target.copy(target)
    this.camera.position.copy(target).addScaledVector(direction, radius)
  }

  /** Supplied by the overlay — how much of each edge the detail panel covers. */
  reservedRightPx: () => number = () => 0
  reservedBottomPx: () => number = () => 0

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

      // Fog has to track the camera. Parked at a fixed depth it silently eats
      // the whole shelf as soon as the grid pulls back past it — which is what
      // a narrow window does.
      const focusDepth = this.camera.position.distanceTo(this.controls.target)
      this.fog.near = focusDepth * 1.15
      this.fog.far = focusDepth * 4
      onFrame?.(delta)
      this.renderer.render(this.scene, this.camera)
    })
  }
}
