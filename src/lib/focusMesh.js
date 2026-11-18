import { clamp01 } from './focusTransition.js'

export function decodeFocusMotion(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16) throw new Error('Motion data is truncated')
  const view = new DataView(buffer)
  if (view.getUint32(0, false) !== 0x464d5731) throw new Error('Unsupported motion data')
  const size = view.getUint16(4, true), side = view.getUint16(6, true)
  const frames = view.getUint16(8, true), quant = view.getUint16(10, true)
  if (size !== 384 || side !== 33 || frames !== 32 || quant !== 32) throw new Error('Motion grid does not match the character')
  const count = (frames - 1) * 2 * side * side * 2
  if (buffer.byteLength !== 16 + count * 2) throw new Error('Motion data has the wrong length')
  const vectors = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    vectors[i] = view.getInt16(16 + i * 2, true) / quant
    if (Math.abs(vectors[i]) > 48) throw new Error('Motion displacement is out of range')
  }
  return { size, side, frames, vectors }
}

// Vertex positions follow the feature motion; UVs stay on the original drawing.
// Production data has two fields per pair: A→B and B→A, in pixel units.
export function fillFocusVertices(out, motion, frame, direction, amount, columns, rows) {
  const { size, side, frames, vectors } = motion
  const pair = Math.min(frame - direction, frames - 2)
  const offset = (Math.max(0, pair) * 2 + direction) * side * side * 2
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = y * side + x
    const px = Math.round(x * (size - 1) / (side - 1)), py = Math.round(y * (size - 1) / (side - 1))
    out[i * 4] = px + (amount ? vectors[offset + i * 2] * amount : 0)
    out[i * 4 + 1] = py + (amount ? vectors[offset + i * 2 + 1] * amount : 0)
    out[i * 4 + 2] = ((frame % columns) * size + px + .5) / (columns * size)
    out[i * 4 + 3] = (Math.floor(frame / columns) * size + py + .5) / (rows * size)
  }
  return out
}

export function focusMeshIndices(side) {
  const indices = new Uint16Array((side - 1) ** 2 * 6)
  let p = 0
  for (let y = 0; y < side - 1; y++) for (let x = 0; x < side - 1; x++) {
    const a = y * side + x, b = a + 1, c = a + side, d = c + 1
    indices.set([a, c, b, b, c, d], p); p += 6
  }
  return indices
}

function shader(gl, type, source) {
  const value = gl.createShader(type)
  gl.shaderSource(value, source); gl.compileShader(value)
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(value); gl.deleteShader(value); throw new Error(error)
  }
  return value
}

/** Two aligned texture meshes share one premultiplied canvas. No whole-body
 * opacity swap: both outlines move to the intermediate body shape first.
 * Canvas fallback deliberately paints one key pose, with the shorter timing.
 */
export function createFocusMeshRenderer(canvas, fallback, image, motion, { columns = 8, rows = 4, endpoints = [], onMode = () => {} } = {}) {
  const size = motion?.size || 384, frames = motion?.frames || columns * rows
  canvas.width = fallback.width = size; canvas.height = fallback.height = size
  const flat = fallback.getContext('2d')
  const textures = []
  let gl = null, program, texture, vertices, elements, vertexShader, fragmentShader
  let buffer, indices, position, uv, weight, sizeUniform, mode = 'canvas-keyframes', disposed = false, lastPose = 0
  const fallbackMode = () => {
    mode = 'canvas-keyframes'; canvas.hidden = true; fallback.hidden = false; onMode(mode)
  }
  function upload(source) {
    const target = gl.createTexture()
    textures.push(target)
    gl.bindTexture(gl.TEXTURE_2D, target)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    return target
  }
  let endpointTextures = []
  try {
    if (!motion) throw new Error('Motion data unavailable')
    gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, depth: false, stencil: false })
    if (!gl) throw new Error('WebGL unavailable')
    vertexShader = shader(gl, gl.VERTEX_SHADER, 'attribute vec2 a_position; attribute vec2 a_uv; uniform float u_size; varying vec2 v_uv; void main(){vec2 p=a_position/u_size;gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);v_uv=a_uv;}')
    fragmentShader = shader(gl, gl.FRAGMENT_SHADER, 'precision highp float; varying vec2 v_uv; uniform sampler2D u_image; uniform float u_weight; void main(){vec4 c=texture2D(u_image,v_uv);gl_FragColor=vec4(c.rgb*c.a,c.a)*u_weight;}')
    program = gl.createProgram(); gl.attachShader(program, vertexShader); gl.attachShader(program, fragmentShader); gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
    gl.useProgram(program)
    position = gl.getAttribLocation(program, 'a_position'); uv = gl.getAttribLocation(program, 'a_uv')
    weight = gl.getUniformLocation(program, 'u_weight'); sizeUniform = gl.getUniformLocation(program, 'u_size')
    vertices = gl.createBuffer(); elements = gl.createBuffer()
    indices = focusMeshIndices(motion.side); buffer = new Float32Array(motion.side * motion.side * 4)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, buffer.byteLength, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
    gl.activeTexture(gl.TEXTURE0)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    texture = upload(image)
    endpointTextures = endpoints.map(endpoint => endpoint ? upload(endpoint) : null)
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0); gl.uniform1f(sizeUniform, size)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.clearColor(0, 0, 0, 0)
    mode = 'webgl-flow'; canvas.hidden = false; fallback.hidden = true; onMode(mode)
  } catch { fallbackMode() }

  const paint = value => {
    if (disposed) return
    const pose = clamp01(value); lastPose = pose
    const p = pose * (frames - 1), first = Math.floor(p), mix = p - first
    const index = pose < .5 ? 0 : 1
    const endpoint = endpoints[index]
    const distance = index === 0 ? p : frames - 1 - p
    const t = endpoint ? clamp01(1 - distance / 2) : 0
    const detailed = t * t * (3 - 2 * t)
    if (mode !== 'webgl-flow') {
      if (!flat) return
      const side = fallback.width
      const frame = Math.round(p)
      flat.clearRect(0, 0, side, side)
      flat.globalCompositeOperation = 'source-over'
      flat.globalAlpha = 1 - detailed
      if (detailed < 1) flat.drawImage(image, (frame % columns) * size, Math.floor(frame / columns) * size, size, size, 0, 0, side, side)
      if (detailed > 0) {
        flat.globalCompositeOperation = 'lighter'
        flat.globalAlpha = detailed
        flat.drawImage(endpoint, 0, 0, side, side)
      }
      return
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.clear(gl.COLOR_BUFFER_BIT)
    const draw = (frame, direction, amount, opacity, gridColumns = columns, gridRows = rows) => {
      if (opacity < .00001) return
      fillFocusVertices(buffer, motion, frame, direction, amount, gridColumns, gridRows)
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferSubData(gl.ARRAY_BUFFER, 0, buffer)
      gl.uniform1f(weight, opacity); gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0)
    }
    gl.bindTexture(gl.TEXTURE_2D, texture)
    draw(first, 0, first === frames - 1 ? 0 : mix, (1 - mix) * (1 - detailed))
    if (mix > .00001) draw(first + 1, 1, 1 - mix, mix * (1 - detailed))
    if (detailed > 0) {
      gl.bindTexture(gl.TEXTURE_2D, endpointTextures[index])
      draw(0, 0, 0, detailed, 1, 1)
    }
  }
  const lost = event => { event.preventDefault(); if (!disposed) { fallbackMode(); paint(lastPose) } }
  canvas.addEventListener('webglcontextlost', lost)
  return {
    get mode() { return mode }, paint,
    resize(pixels) {
      // Quantize the backing size so rotating/resizing the viewport doesn't
      // continuously reallocate GPU buffers. Motion vectors stay at 384 px.
      const side = Math.min(1152, Math.max(size, Math.ceil(pixels / 32) * 32))
      if (canvas.width === side) return
      canvas.width = canvas.height = fallback.width = fallback.height = side
      paint(lastPose)
    },
    dispose() {
      disposed = true; canvas.removeEventListener('webglcontextlost', lost)
      if (gl) {
        for (const target of textures) gl.deleteTexture(target)
        if (vertices) gl.deleteBuffer(vertices)
        if (elements) gl.deleteBuffer(elements)
        if (program) gl.deleteProgram(program)
        if (vertexShader) gl.deleteShader(vertexShader)
        if (fragmentShader) gl.deleteShader(fragmentShader)
      }
    },
  }
}
