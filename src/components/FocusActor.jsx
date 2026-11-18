import { memo, useEffect, useRef } from 'react'
import { createFocusMeshRenderer, decodeFocusMotion } from '../lib/focusMesh'

const root = import.meta.env.BASE_URL + 'art/focus/'
const atlasUrl = root + 'wuxia-sit-sequence-32.webp'
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })
}

let resources
function load() {
  if (!resources) resources = Promise.all([
    loadImage(atlasUrl),
    fetch(root + 'wuxia-motion-v1.bin').then(response => { if (!response.ok) throw new Error('Motion unavailable'); return response.arrayBuffer() }).then(decodeFocusMotion).catch(() => null),
    Promise.all(['stand', 'sit'].map(pose => loadImage(root + 'wuxia-' + pose + '-hd.webp').catch(() => null))),
  ]).catch(error => { resources = null; throw error })
  return resources
}

function FocusActor({ motion, onReady, onError }) {
  const actor = useRef(null), canvas = useRef(null), fallback = useRef(null)
  const callbacks = useRef({ onReady, onError }); callbacks.current = { onReady, onError }
  useEffect(() => {
    let disposed = false, renderer, unsubscribe, observer
    load().then(([image, field, endpoints]) => {
      if (disposed) return
      const element = actor.current
      renderer = createFocusMeshRenderer(canvas.current, fallback.current, image, field, {
        endpoints,
        onMode: mode => { element.dataset.renderer = mode },
      })
      const resize = () => renderer.resize(Math.ceil(element.clientWidth * (window.devicePixelRatio || 1) * 1.17))
      resize()
      observer = new ResizeObserver(resize)
      observer.observe(element)
      const draw = state => {
        renderer.paint(state.pose)
        if (actor.current) {
          actor.current.dataset.poseFrame = String(Math.floor(state.pose * 31))
          actor.current.dataset.motionProgress = state.pose.toFixed(5)
          const label = state.pose < .01 ? '青衣武侠背身站立，眺望远山' : state.pose > .99 ? '武侠背对观者盘坐石台，静望山水' : '武侠正在连续屈膝入座'
          if (actor.current.getAttribute('aria-label') !== label) actor.current.setAttribute('aria-label', label)
        }
      }
      unsubscribe = motion.subscribe(draw)
      callbacks.current.onReady(2)
    }).catch(() => { if (!disposed) callbacks.current.onError() })
    return () => { disposed = true; observer?.disconnect(); unsubscribe?.(); renderer?.dispose() }
  }, [motion])
  return <div ref={actor} className="focus-actor" role="img" aria-label="正在铺开人物" data-pose-count="32" data-pose-frame="0" data-renderer="loading">
    <canvas ref={canvas} className="focus-character-canvas" aria-hidden="true" />
    <canvas ref={fallback} className="focus-character-canvas" aria-hidden="true" hidden />
  </div>
}

export default memo(FocusActor)
