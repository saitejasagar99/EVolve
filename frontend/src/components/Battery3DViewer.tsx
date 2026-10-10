import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import {
  Activity,
  Compass,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react'

export interface BatteryModuleInfo {
  id: number
  name: string
  cellCount: number
  voltageV: number
  sohPct: number
  temperatureC: number
  resistanceMOhm: number
  status: 'OPTIMAL' | 'NORMAL' | 'DEGRADED' | 'EVALUATE'
}

interface Battery3DViewerProps {
  batteryId?: string
  chemistry?: string
  soh?: number | null
  temperature?: number | null
  inspectionMode?: 'overview' | 'modules' | 'health' | 'lifecycle'
  selectedModuleId?: number | null
  onSelectModule?: (module: BatteryModuleInfo) => void
  showControls?: boolean
  className?: string
  height?: string
}

export const Battery3DViewer: React.FC<Battery3DViewerProps> = ({
  batteryId = 'BAT-EV-0001',
  chemistry = 'LFP',
  soh = 86,
  temperature = 31.4,
  inspectionMode = 'overview',
  selectedModuleId = null,
  onSelectModule,
  showControls = true,
  className = '',
  height = '500px',
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const [webglSupported, setWebglSupported] = useState<boolean>(true)
  const [hoveredModule, setHoveredModule] = useState<BatteryModuleInfo | null>(null)
  const [activeModule, setActiveModule] = useState<number | null>(selectedModuleId)
  const [explodedView, setExplodedView] = useState<boolean>(inspectionMode === 'modules')
  const [autoRotate, setAutoRotate] = useState<boolean>(true)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  // References for Three.js internals
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const packGroupRef = useRef<THREE.Group | null>(null)
  const modulesGroupRef = useRef<THREE.Group | null>(null)
  const topCoverRef = useRef<THREE.Mesh | null>(null)
  const moduleMeshesRef = useRef<Array<{ mesh: THREE.Mesh; info: BatteryModuleInfo }>>([])

  // Interaction tracking
  const isDraggingRef = useRef(false)
  const previousMousePositionRef = useRef({ x: 0, y: 0 })
  const rotationTargetRef = useRef({ x: 0.35, y: -0.65 })
  const zoomLevelRef = useRef<number>(1)

  // Generate 8 realistic module profiles based on overall pack health
  const getModuleData = useCallback((): BatteryModuleInfo[] => {
    const baseSoh = soh ?? 85
    const baseTemp = temperature ?? 32
    return Array.from({ length: 8 }, (_, i) => {
      // Variance across individual cells
      const offset = (Math.sin(i * 1.7) * 2.8) - (i % 2 === 0 ? 0.5 : 1.2)
      const mSoh = Math.min(100, Math.max(45, Math.round(baseSoh + offset)))
      const mTemp = +(baseTemp + (i === 3 || i === 4 ? 1.8 : -0.6)).toFixed(1)
      const mRes = +(0.42 + (100 - mSoh) * 0.005).toFixed(3)
      let status: 'OPTIMAL' | 'NORMAL' | 'DEGRADED' | 'EVALUATE' = 'OPTIMAL'
      if (mSoh < 65) status = 'DEGRADED'
      else if (mSoh < 75) status = 'EVALUATE'
      else if (mSoh < 85) status = 'NORMAL'

      return {
        id: i + 1,
        name: `Module M-${String(i + 1).padStart(2, '0')}`,
        cellCount: chemistry === 'LFP' ? 16 : 12,
        voltageV: +(48.2 + (mSoh / 100) * 3.4).toFixed(1),
        sohPct: mSoh,
        temperatureC: mTemp,
        resistanceMOhm: mRes,
        status,
      }
    })
  }, [soh, temperature, chemistry])

  // Sync prop changes
  useEffect(() => {
    setActiveModule(selectedModuleId)
  }, [selectedModuleId])

  useEffect(() => {
    setExplodedView(inspectionMode === 'modules')
  }, [inspectionMode])

  // Main Three.js Lifecycle
  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    // Verify WebGL availability
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (!gl) {
        setWebglSupported(false)
        return
      }
    } catch {
      setWebglSupported(false)
      return
    }

    const width = container.clientWidth || 600
    const heightPx = container.clientHeight || 500

    // 1. Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(42, width / heightPx, 0.1, 1000)
    camera.position.set(0, 7.5, 12.5)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setSize(width, heightPx)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor(0xf8fafc, 1) // Crisp clean studio white background
    container.innerHTML = ''
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 4. Lights (Studio Lighting for Light Background)
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.4)
    scene.add(ambientLight)

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0)
    keyLight.position.set(8, 14, 10)
    keyLight.castShadow = true
    scene.add(keyLight)

    const cyanRimLight = new THREE.DirectionalLight(0x059669, 1.2)
    cyanRimLight.position.set(-10, 6, -8)
    scene.add(cyanRimLight)

    const emeraldFillLight = new THREE.DirectionalLight(0x0ea5e9, 1.0)
    emeraldFillLight.position.set(10, -4, 6)
    scene.add(emeraldFillLight)

    // Internal pack glow point light
    const internalGlow = new THREE.PointLight(0x10b981, 1.2, 12)
    internalGlow.position.set(0, 0.5, 0)
    scene.add(internalGlow)

    // 5. Build Procedural EV Battery Pack Assembly
    const packGroup = new THREE.Group()
    packGroupRef.current = packGroup
    scene.add(packGroup)

    // A. Lower Structural Tray (Aluminum Alloy Enclosure)
    const trayGeo = new THREE.BoxGeometry(8.6, 0.45, 5.2)
    const trayMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Premium dark metallic casing with clear highlights
      metalness: 0.8,
      roughness: 0.3,
    })
    const trayMesh = new THREE.Mesh(trayGeo, trayMat)
    trayMesh.position.y = -0.3
    trayMesh.receiveShadow = true
    packGroup.add(trayMesh)

    // Side reinforcement rails with cooling channels
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.35,
    })
    const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 5.2), railMat)
    leftRail.position.set(-4.35, 0, 0)
    packGroup.add(leftRail)

    const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 5.2), railMat)
    rightRail.position.set(4.35, 0, 0)
    packGroup.add(rightRail)

    // Base Studio Floor Grid (Soft subtle light engineering grid)
    const gridHelper = new THREE.GridHelper(16, 16, 0x059669, 0xe2e8f0)
    gridHelper.position.y = -1.5
    scene.add(gridHelper)

    // B. Modules Group (2 rows x 4 columns = 8 modules)
    const modulesGroup = new THREE.Group()
    modulesGroupRef.current = modulesGroup
    packGroup.add(modulesGroup)

    const moduleData = getModuleData()
    const moduleMeshes: Array<{ mesh: THREE.Mesh; info: BatteryModuleInfo }> = []

    const modWidth = 1.85
    const modHeight = 1.15
    const modDepth = 2.15
    const spacingX = 2.05
    const spacingZ = 2.35

    moduleData.forEach((info, idx) => {
      const row = Math.floor(idx / 4) // 0 or 1
      const col = idx % 4 // 0, 1, 2, 3

      const posX = (col - 1.5) * spacingX
      const posZ = (row - 0.5) * spacingZ

      // Determine module color by health or selection
      let emissiveColor = 0x000000
      let baseColor = 0x334155

      if (info.status === 'OPTIMAL') {
        emissiveColor = 0x059669
        baseColor = 0x10b981 // Vibrant emerald green cells
      } else if (info.status === 'NORMAL') {
        emissiveColor = 0x0284c7
        baseColor = 0x0ea5e9 // Cyan/sky blue cells
      } else if (info.status === 'EVALUATE') {
        emissiveColor = 0xd97706
        baseColor = 0xf59e0b // Amber cells
      } else {
        emissiveColor = 0xe11d48
        baseColor = 0xf43f5e // Coral cells
      }

      const modMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        metalness: 0.55,
        roughness: 0.35,
        emissive: emissiveColor,
        emissiveIntensity: 0.25,
      })

      const modGeo = new THREE.BoxGeometry(modWidth, modHeight, modDepth)
      const modMesh = new THREE.Mesh(modGeo, modMat)
      modMesh.position.set(posX, 0.45, posZ)
      modMesh.castShadow = true
      modMesh.receiveShadow = true
      modMesh.userData = { isModule: true, moduleInfo: info }

      // Top copper busbar terminals
      const busbarGeo = new THREE.BoxGeometry(0.3, 0.1, 0.6)
      const busbarMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.95,
        roughness: 0.15,
      })
      const posTerminal = new THREE.Mesh(busbarGeo, busbarMat)
      posTerminal.position.set(posX - 0.45, 1.05, posZ)
      packGroup.add(posTerminal)

      const negTerminal = new THREE.Mesh(busbarGeo, busbarMat)
      negTerminal.position.set(posX + 0.45, 1.05, posZ)
      packGroup.add(negTerminal)

      // Active status LED light node on module
      const ledGeo = new THREE.SphereGeometry(0.08, 12, 12)
      const ledMat = new THREE.MeshBasicMaterial({
        color: info.status === 'OPTIMAL' ? 0x10b981 : info.status === 'NORMAL' ? 0x0ea5e9 : 0xf59e0b,
      })
      const ledMesh = new THREE.Mesh(ledGeo, ledMat)
      ledMesh.position.set(posX, 1.06, posZ - 0.8)
      packGroup.add(ledMesh)

      modulesGroup.add(modMesh)
      moduleMeshes.push({ mesh: modMesh, info })
    })

    moduleMeshesRef.current = moduleMeshes

    // C. High-Voltage High-Current Interconnect Busbar (Central Spine)
    const spineGeo = new THREE.BoxGeometry(8.2, 0.08, 0.25)
    const spineMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      metalness: 0.85,
      roughness: 0.2,
      emissive: 0xea580c,
      emissiveIntensity: 0.35,
    })
    const spineMesh = new THREE.Mesh(spineGeo, spineMat)
    spineMesh.position.set(0, 1.08, 0)
    packGroup.add(spineMesh)

    // D. Clear Acrylic Upper Protective Enclosure / Lid
    const topCoverGeo = new THREE.BoxGeometry(8.65, 0.35, 5.25)
    const topCoverMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      metalness: 0.1,
      roughness: 0.05,
      transparent: true,
      opacity: 0.22,
      transmission: 0.88,
      ior: 1.45,
    })
    const topCoverMesh = new THREE.Mesh(topCoverGeo, topCoverMat)
    topCoverMesh.position.set(0, 1.25, 0)
    packGroup.add(topCoverMesh)
    topCoverRef.current = topCoverMesh

    // Raycaster for mouse picking
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      if (isDraggingRef.current) {
        const deltaX = e.clientX - previousMousePositionRef.current.x
        const deltaY = e.clientY - previousMousePositionRef.current.y
        rotationTargetRef.current.y += deltaX * 0.008
        rotationTargetRef.current.x += deltaY * 0.006
        // Clamp pitch to avoid flips
        rotationTargetRef.current.x = Math.max(-0.6, Math.min(1.1, rotationTargetRef.current.x))
        previousMousePositionRef.current = { x: e.clientX, y: e.clientY }
      } else {
        // Raycast module hover
        raycaster.setFromCamera(mouse, camera)
        const intersects = raycaster.intersectObjects(
          moduleMeshes.map((m) => m.mesh)
        )

        if (intersects.length > 0) {
          const hit = intersects[0].object as THREE.Mesh
          const found = moduleMeshes.find((m) => m.mesh === hit)
          if (found) {
            setHoveredModule(found.info)
            setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
            container.style.cursor = 'pointer'
            return
          }
        }
        setHoveredModule(null)
        setTooltipPos(null)
        container.style.cursor = isDraggingRef.current ? 'grabbing' : 'grab'
      }
    }

    const onPointerDown = (e: MouseEvent) => {
      isDraggingRef.current = true
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY }
      setAutoRotate(false)
    }

    const onPointerUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false

      // Check click on module
      const rect = container.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(moduleMeshes.map((m) => m.mesh))

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh
        const found = moduleMeshes.find((m) => m.mesh === hit)
        if (found) {
          setActiveModule(found.info.id)
          if (onSelectModule) onSelectModule(found.info)
        }
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomLevelRef.current = Math.min(1.7, Math.max(0.65, zoomLevelRef.current + e.deltaY * -0.0012))
      camera.position.z = 12.5 / zoomLevelRef.current
    }

    container.addEventListener('mousemove', onPointerMove)
    container.addEventListener('mousedown', onPointerDown)
    window.addEventListener('mouseup', onPointerUp)
    container.addEventListener('wheel', onWheel, { passive: false })

    // Resize Handler
    const onResize = () => {
      if (!container || !camera || !renderer) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // Animation Loop
    let clock = new THREE.Clock()
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      const delta = clock.getDelta()

      // Idle Rotation
      if (autoRotate && !isDraggingRef.current) {
        rotationTargetRef.current.y += delta * 0.22
      }

      // Smooth damped rotation interpolation
      packGroup.rotation.y += (rotationTargetRef.current.y - packGroup.rotation.y) * 0.08
      packGroup.rotation.x += (rotationTargetRef.current.x - packGroup.rotation.x) * 0.08

      // Exploded / Inspection View Smooth Elevation
      if (topCoverRef.current) {
        const targetLidY = explodedView ? 3.8 : 1.25
        const targetOpacity = explodedView ? 0.15 : 0.38
        topCoverRef.current.position.y += (targetLidY - topCoverRef.current.position.y) * 0.08
        ;(topCoverRef.current.material as THREE.MeshPhysicalMaterial).opacity +=
          (targetOpacity - (topCoverRef.current.material as THREE.MeshPhysicalMaterial).opacity) * 0.08
      }

      // Modules Exploded Spacing
      moduleMeshes.forEach(({ mesh, info }) => {
        const row = Math.floor((info.id - 1) / 4)
        const col = (info.id - 1) % 4
        const targetSpacingX = explodedView ? 2.35 : 2.05
        const targetSpacingZ = explodedView ? 2.85 : 2.35
        const targetY = explodedView ? 0.65 : 0.45

        const targetX = (col - 1.5) * targetSpacingX
        const targetZ = (row - 0.5) * targetSpacingZ

        mesh.position.x += (targetX - mesh.position.x) * 0.08
        mesh.position.z += (targetZ - mesh.position.z) * 0.08
        mesh.position.y += (targetY - mesh.position.y) * 0.08

        // Highlight selected or hovered module
        const isSelected = activeModule === info.id
        const isHovered = hoveredModule?.id === info.id
        const mat = mesh.material as THREE.MeshStandardMaterial

        if (isSelected) {
          mat.emissive.setHex(0x059669)
          mat.emissiveIntensity = 0.75
        } else if (isHovered) {
          mat.emissive.setHex(0x10b981)
          mat.emissiveIntensity = 0.5
        } else {
          // Restore base status color
          const baseEmissive =
            info.status === 'OPTIMAL'
              ? 0x059669
              : info.status === 'NORMAL'
                ? 0x0284c7
                : info.status === 'EVALUATE'
                  ? 0xd97706
                  : 0xe11d48
          mat.emissive.setHex(baseEmissive)
          mat.emissiveIntensity = 0.25
        }
      })

      renderer.render(scene, camera)
    }

    animate()

    // Cleanup
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      container.removeEventListener('mousemove', onPointerMove)
      container.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('mouseup', onPointerUp)
      container.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [getModuleData, autoRotate, explodedView, activeModule, hoveredModule, onSelectModule])

  // Controls Handlers
  const handleResetCamera = () => {
    rotationTargetRef.current = { x: 0.35, y: -0.65 }
    zoomLevelRef.current = 1
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 7.5, 12.5)
      cameraRef.current.lookAt(0, 0, 0)
    }
  }

  const handleZoom = (direction: 'in' | 'out') => {
    if (!cameraRef.current) return
    const delta = direction === 'in' ? 0.2 : -0.2
    zoomLevelRef.current = Math.min(1.7, Math.max(0.65, zoomLevelRef.current + delta))
    cameraRef.current.position.z = 12.5 / zoomLevelRef.current
  }

  // -------------------------------------------------------------
  // STATIC 2.5D FALLBACK (if WebGL is unavailable or reduced-motion)
  // -------------------------------------------------------------
  if (!webglSupported) {
    const modules = getModuleData()
    return (
      <div className={`relative overflow-hidden rounded-2xl border border-ink-200 bg-white p-6 text-ink-900 shadow-xs ${className}`}>
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-600" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink-800">
              Interactive 2.5D Pack Schematic (Safe Fallback)
            </span>
          </div>
          <span className="font-mono text-[10px] text-ink-500">Pack ID: {batteryId}</span>
        </div>

        {/* 2x4 Module Grid Layout */}
        <div className="my-6 grid grid-cols-4 gap-3">
          {modules.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setActiveModule(m.id)
                if (onSelectModule) onSelectModule(m)
              }}
              className={`rounded-xl border p-3 text-left transition-all ${
                activeModule === m.id
                  ? 'border-brand-500 bg-brand-50 shadow-2xs scale-102'
                  : 'border-ink-200 bg-ink-50/50 hover:border-brand-300 hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-ink-800">{m.name}</span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    m.status === 'OPTIMAL' ? 'bg-emerald-500' : m.status === 'NORMAL' ? 'bg-teal-500' : 'bg-amber-500'
                  }`}
                />
              </div>
              <div className="mt-2 text-sm font-black text-brand-700 tnum">{m.sohPct}% SOH</div>
              <div className="text-[10px] text-ink-500 font-mono mt-0.5">{m.voltageV}V • {m.temperatureC}°C</div>
            </button>
          ))}
        </div>

        <div className="text-center text-xs text-ink-400">
          WebGL rendering unavailable in current browser environment. Showing high-fidelity telemetry grid.
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------
  // FULL 3D INTERACTIVE CANVAS VIEW
  // -------------------------------------------------------------
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-ink-200 bg-slate-50 text-ink-900 shadow-xs ${className}`}>
      {/* Top Telemetry Header Pill */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 rounded-full border border-ink-200 bg-white/95 px-3.5 py-1.5 backdrop-blur-md shadow-xs pointer-events-auto">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-600" />
          </div>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink-900">
            {batteryId}
          </span>
          <span className="rounded bg-brand-50 border border-brand-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-700">
            {chemistry} PACK
          </span>
        </div>

        {/* Status Callout */}
        <div className="flex items-center gap-2 rounded-full border border-ink-200 bg-white/95 px-3.5 py-1.5 backdrop-blur-md shadow-xs pointer-events-auto">
          <Activity className="h-3.5 w-3.5 text-brand-600" />
          <span className="font-mono text-xs font-bold text-ink-700">
            Health: <span className="text-brand-600 font-extrabold">{soh ?? 86}% SOH</span>
          </span>
          <span className="text-ink-300">|</span>
          <span className="font-mono text-xs text-ink-500">
            Temp: {temperature ?? 31.4}°C
          </span>
        </div>
      </div>

      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        style={{ height }}
        className="relative w-full cursor-grab active:cursor-grabbing select-none"
      />

      {/* Floating Interactive Hotspot Tooltip */}
      {hoveredModule && tooltipPos && (
        <div
          className="pointer-events-none absolute z-30 transform -translate-x-1/2 -translate-y-full mb-3 rounded-xl border border-brand-200 bg-white/95 p-3 shadow-lg backdrop-blur-md animate-scaleIn text-ink-900"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-ink-900">
            <span>{hoveredModule.name}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase ${
                hoveredModule.status === 'OPTIMAL'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-brand-50 text-brand-700 border border-brand-200'
              }`}
            >
              {hoveredModule.status}
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px] font-mono text-ink-600">
            <div>
              <span className="text-ink-400 text-[9px] block">HEALTH</span>
              <span className="font-bold text-brand-700">{hoveredModule.sohPct}% SOH</span>
            </div>
            <div>
              <span className="text-ink-400 text-[9px] block">VOLTAGE</span>
              <span className="font-bold text-ink-800">{hoveredModule.voltageV} V</span>
            </div>
            <div>
              <span className="text-ink-400 text-[9px] block">CELLS</span>
              <span className="font-bold text-ink-800">{hoveredModule.cellCount}S</span>
            </div>
            <div>
              <span className="text-ink-400 text-[9px] block">RESISTANCE</span>
              <span className="font-bold text-ink-800">{hoveredModule.resistanceMOhm} mΩ</span>
            </div>
          </div>
          <div className="mt-2 text-[9.5px] font-mono text-brand-700 border-t border-ink-100 pt-1 text-center font-semibold">
            Click to inspect module telemetry
          </div>
        </div>
      )}

      {/* 3D Action Controls Bar */}
      {showControls && (
        <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2">
          {/* Interaction Mode Toggles */}
          <div className="flex items-center gap-1 rounded-2xl border border-ink-200 bg-white/95 p-1 backdrop-blur-md shadow-xs">
            <button
              onClick={() => setExplodedView(!explodedView)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                explodedView
                  ? 'bg-brand-600 text-white shadow-2xs font-bold'
                  : 'text-ink-700 hover:bg-ink-100'
              }`}
              title="Separate upper cover and space out individual modules"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{explodedView ? 'Pack View' : 'Inspect Modules'}</span>
            </button>

            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                autoRotate
                  ? 'bg-brand-50 text-brand-700 border border-brand-200 font-semibold'
                  : 'text-ink-500 hover:bg-ink-100'
              }`}
              title="Toggle automatic rotation"
            >
              <Compass className="h-3.5 w-3.5" />
              <span>{autoRotate ? 'Rotating' : 'Paused'}</span>
            </button>
          </div>

          {/* Camera / Zoom Controls */}
          <div className="flex items-center gap-1 rounded-2xl border border-ink-200 bg-white/95 p-1 backdrop-blur-md shadow-xs">
            <button
              onClick={() => handleZoom('in')}
              className="rounded-xl p-1.5 text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="rounded-xl p-1.5 text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleResetCamera}
              className="flex items-center gap-1 rounded-xl px-2 py-1 text-xs text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition"
              title="Reset View"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="text-[11px] font-mono font-medium">Reset</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Selected Module Chip */}
      {activeModule && (
        <div className="absolute top-16 left-4 z-20 rounded-xl border border-brand-200 bg-white/95 p-2.5 backdrop-blur-md shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-600" />
            <span className="font-mono text-xs font-bold text-brand-700">
              Module {activeModule} Selected
            </span>
            <button
              onClick={() => setActiveModule(null)}
              className="ml-2 text-ink-400 hover:text-ink-900 text-xs font-bold"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
