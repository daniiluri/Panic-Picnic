import { useLanguage } from './i18n'
import { useEffect, useRef } from 'react'
import * as T from 'three'
import { avatars } from './game'

type Entry = { id: string; avatar: number; name: string; value: number }
const ink = '#271b38'
const cream = '#fff2cf'
const material = (color: string) =>
  new T.MeshStandardMaterial({ color, roughness: 0.78, flatShading: true })

function mesh(
  parent: T.Object3D,
  shape: T.BufferGeometry,
  color: string,
  x: number,
  y: number,
  z: number,
) {
  const part = new T.Mesh(shape, material(color))
  part.position.set(x, y, z)
  parent.add(part)
  return part
}
function oval(
  parent: T.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) {
  const part = mesh(parent, new T.SphereGeometry(1, 16, 12), color, x, y, z)
  part.scale.set(w, h, d)
  return part
}
function box(
  parent: T.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) {
  return mesh(parent, new T.BoxGeometry(w, h, d), color, x, y, z)
}
function avatar(index: number) {
  const actor = new T.Group()
  const color = avatars[index].color
  let faceZ = 0.43
  if (index === 0) {
    oval(actor, color, 0, 1.1, 0, 0.47, 0.84, 0.43)
    oval(actor, '#ff9c48', -0.03, 1.86, -0.01, 0.46, 0.22, 0.42)
    oval(actor, '#ea7936', -0.28, 1.79, -0.18, 0.48, 0.07, 0.34)
    for (let i = 0; i < 5; i++)
      oval(actor, '#6bb747', -0.33 + (i % 2) * 0.63, 0.79 + i * 0.135, 0.23, 0.055, 0.09, 0.06)
  } else if (index === 1) {
    const profile = [
      [0, 0.32],
      [0.23, 0.42],
      [0.51, 0.75],
      [0.58, 1.13],
      [0.49, 1.41],
      [0.31, 1.51],
      [0, 1.52],
    ]
    mesh(
      actor,
      new T.LatheGeometry(
        profile.map(([x, y]) => new T.Vector2(x, y)),
        20,
      ),
      color,
      0,
      0,
      0,
    )
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3
      const leaf = oval(
        actor,
        '#69bd54',
        Math.sin(angle) * 0.22,
        1.5,
        Math.cos(angle) * 0.2,
        0.11,
        0.09,
        0.32,
      )
      leaf.rotation.y = angle
    }
    for (const x of [-0.32, 0, 0.32])
      oval(actor, '#ffe196', x, 0.76, 0.43 - Math.abs(x) * 0.17, 0.035, 0.07, 0.032)
    faceZ = 0.54
  } else if (index === 2) {
    const bread = new T.Shape()
    bread.moveTo(-0.49, 0.43)
    bread.lineTo(0.49, 0.43)
    bread.lineTo(0.49, 1.34)
    bread.bezierCurveTo(0.82, 1.75, 0.18, 1.84, 0, 1.69)
    bread.bezierCurveTo(-0.3, 1.86, -0.8, 1.69, -0.49, 1.34)
    bread.closePath()
    mesh(
      actor,
      new T.ExtrudeGeometry(bread, {
        depth: 0.3,
        bevelEnabled: true,
        bevelSize: 0.055,
        bevelThickness: 0.05,
        bevelSegments: 2,
      }),
      '#d78a48',
      0,
      0,
      -0.18,
    )
    const inner = mesh(actor, new T.ShapeGeometry(bread), color, 0, 0.07, 0.185)
    inner.scale.set(0.9, 0.91, 1)
    faceZ = 0.21
  } else if (index === 3) {
    for (const [x, y, z] of [
      [0, 0.59, 0],
      [-0.26, 0.91, 0],
      [0.26, 0.91, 0],
      [0, 1.1, 0.17],
      [-0.32, 1.32, -0.04],
      [0.32, 1.32, -0.04],
      [0, 1.49, -0.09],
    ])
      oval(actor, color, x, y, z, 0.34, 0.35, 0.32)
    oval(actor, '#63bd65', 0.18, 1.81, 0, 0.29, 0.09, 0.14).rotation.z = 0.32
    faceZ = 0.45
  } else if (index === 4) {
    oval(actor, cream, 0, 1.09, 0, 0.54, 0.81, 0.46)
    oval(actor, '#ffbb41', 0, 0.92, 0.33, 0.37, 0.36, 0.18)
    faceZ = 0.45
  } else {
    mesh(actor, new T.CylinderGeometry(0.45, 0.39, 1.12, 18), color, 0, 1.07, 0)
    for (const y of [0.51, 1.63])
      mesh(actor, new T.CylinderGeometry(0.47, 0.47, 0.07, 18), cream, 0, y, 0)
    mesh(
      actor,
      new T.CylinderGeometry(0.045, 0.045, 0.52, 8),
      '#fc759a',
      0.15,
      1.88,
      0,
    ).rotation.z = -0.25
  }
  if (index === 2) {
    for (const x of [-0.24, 0.24])
      box(actor, ink, x, 1.27, faceZ, 0.39, 0.21, 0.1).rotation.z = x / 3
    box(actor, ink, 0, 1.29, faceZ, 0.15, 0.055, 0.07)
  } else {
    for (const x of [-0.16, 0.16]) {
      oval(actor, cream, x, 1.27, faceZ - 0.04, 0.112, 0.16, 0.085)
      oval(actor, ink, x + 0.015, 1.25, faceZ + 0.031, 0.055, 0.1, 0.032)
    }
  }
  oval(actor, ink, 0, 1.02, faceZ + 0.023, 0.126, 0.087, 0.042)
  oval(actor, '#ff7b9c', 0.02, 0.985, faceZ + 0.054, 0.067, 0.028, 0.024)
  for (const side of [-1, 1]) {
    oval(actor, ink, side * 0.5, 0.94, 0, 0.09, 0.26, 0.095).rotation.z = side * 0.44
    oval(actor, cream, side * 0.6, 0.74, 0.055, 0.14, 0.135, 0.13)
    oval(actor, ink, side * 0.21, 0.34, 0, 0.085, 0.21, 0.09)
    oval(actor, index === 1 ? '#fb9847' : cream, side * 0.23, 0.15, 0.09, 0.215, 0.14, 0.27)
  }
  return actor
}

function nameTag(text: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 66
  const ctx = c.getContext('2d')!
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.roundRect(0, 0, 256, 66, 22)
  ctx.fill()
  ctx.fillStyle = color
  ctx.font = 'bold 34px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 35, 222)
  const map = new T.CanvasTexture(c)
  map.colorSpace = T.SRGBColorSpace
  const sprite = new T.Sprite(new T.SpriteMaterial({ map, depthTest: false }))
  sprite.scale.set(1.8, 0.47, 1)
  sprite.position.y = 2.4
  return sprite
}

export default function Stage({ mode, entries }: { mode: 'avatar' | 'race'; entries: Entry[] }) {
  const { t } = useLanguage()
  const errorNotice = useRef<HTMLSpanElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const latest = useRef(entries)
  const identity = entries.map((p) => p.id + '-' + p.avatar).join(',')
  useEffect(() => {
    latest.current = entries
  }, [entries])
  useEffect(() => {
    const host = mount.current!
    let renderer: T.WebGLRenderer
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      const notice = errorNotice.current!
      notice.hidden = false
      return () => {
        notice.hidden = true
      }
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7))
    host.appendChild(renderer.domElement)
    const scene = new T.Scene()
    scene.add(new T.HemisphereLight(0xfff5ea, 0xb5a1e5, 2.5))
    const light = new T.DirectionalLight(0xffefd6, 2.4)
    light.position.set(-3, 8, 5)
    scene.add(light)
    const camera = new T.OrthographicCamera(-3, 3, 2, -2, 0.1, 100)
    const race = mode === 'race'
    camera.position.set(race ? -6.8 : 2.4, race ? 7 : 2.0, race ? 9 : 5)
    camera.lookAt(0, race ? 0.35 : 0.94, 0)
    const platformHeight = (step: number) => Math.sin(step * 1.2) * 0.12
    if (race) {
      for (const x of [-9, -3, 3, 9]) {
        oval(scene, '#e8dbf3', x, -1.4, -5.8, 1.35, 0.47, 0.72)
        oval(scene, '#f5eafb', x + 0.65, -1.15, -5.8, 0.85, 0.54, 0.63)
      }
    }
    const actors = latest.current.map((p, i, all) => {
      const model = avatar(p.avatar)
      scene.add(model)
      if (race) {
        const lane = (i - (all.length - 1) / 2) * 1.34
        model.scale.setScalar(0.76)
        model.position.set(-6, 0, lane)
        model.add(nameTag(p.name, avatars[p.avatar].color))
        for (let step = 0; step <= 12; step++) {
          box(
            scene,
            step === 12 ? '#fcf2c6' : step % 2 ? '#7664a5' : '#9982c2',
            step - 6,
            platformHeight(step) - 0.28,
            lane,
            0.92,
            0.48,
            1.08,
          )
          box(
            scene,
            step === 12 ? '#ffca48' : avatars[p.avatar].color,
            step - 6,
            platformHeight(step) - 0.018,
            lane,
            0.92,
            0.045,
            1.09,
          )
        }
        box(scene, cream, 6.32, 0.65, lane - 0.4, 0.045, 1.32, 0.045)
        for (let col = 0; col < 4; col++)
          for (let row = 0; row < 2; row++)
            box(
              scene,
              (row + col) % 2 ? ink : cream,
              6.37 + col * 0.13,
              1.25 - row * 0.13,
              lane - 0.4,
              0.13,
              0.13,
              0.025,
            )
      } else {
        mesh(scene, new T.CylinderGeometry(0.88, 0.78, 0.13, 40), '#9c77d2', 0, -0.01, 0)
      }
      return { model, id: p.id, progress: p.value }
    })
    let aspect = 1
    function frameScene() {
      let half = Math.max(1.3, 1.3 / aspect)
      if (race && actors.length) {
        // Keep nearby rivals large on phones and widen the view as the pack separates.
        const positions = actors.map((actor) => actor.model.position.x)
        const first = Math.max(...positions),
          last = Math.min(...positions)
        const spread = first - last
        const center = (first + last) / 2 + 0.4
        const width = 2.1 + spread * 0.46 + (actors.length - 1) * 0.36
        half = Math.max(1.65 + actors.length * 0.23 + spread * 0.13, width / aspect)
        camera.position.set(center - 6.8, 7.7, 9)
        camera.lookAt(center, 0.7, 0)
      }
      camera.left = -half * aspect
      camera.right = half * aspect
      camera.top = half
      camera.bottom = -half
      camera.updateProjectionMatrix()
    }
    function resize() {
      const w = host.clientWidth,
        h = host.clientHeight
      aspect = w / Math.max(1, h)
      frameScene()
      renderer.setSize(w, h)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let last = performance.now()
    renderer.setAnimationLoop((time: number) => {
      const dt = Math.max(0, Math.min(0.1, (time - last) / 1000))
      last = time
      for (const actor of actors) {
        if (race) {
          const value = latest.current.find((p) => p.id === actor.id)?.value ?? actor.progress
          // Keep the animation in step with rapid mic accents.
          actor.progress = reduced ? value : Math.min(value, actor.progress + dt * 12)
          actor.model.position.x = -6 + actor.progress
          actor.model.position.y =
            platformHeight(actor.progress) + Math.sin((actor.progress % 1) * Math.PI) * 0.66
        } else {
          actor.model.rotation.y = reduced ? 0 : Math.sin(time / 1600) * 0.48
          actor.model.position.y = reduced ? 0 : 0.025 * Math.sin(time / 520)
        }
      }
      if (race) frameScene()
      renderer.render(scene, camera)
    })
    return () => {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      scene.traverse((obj) => {
        if (obj instanceof T.Mesh || obj instanceof T.Sprite) {
          if (obj instanceof T.Mesh) obj.geometry.dispose()
          for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
            if ('map' in mat && mat.map instanceof T.Texture) mat.map.dispose()
            mat.dispose()
          }
        }
      })
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [mode, identity])
  return (
    <div
      className={'stage stage-' + mode}
      ref={mount}
      role="img"
      aria-label={
        mode === 'race'
          ? t('Live three-dimensional hopping course')
          : t('Animated character preview')
      }
    >
      <span ref={errorNotice} className="stage-error" hidden>
        {t('3D graphics are unavailable on this device.')}
      </span>
    </div>
  )
}
