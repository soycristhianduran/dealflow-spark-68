import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

/**
 * 3D mascot (Meshy-generated robot) for the Klosify hero.
 * - Polished metal body (low roughness + env reflections).
 * - Idle float + gentle head tracking toward the pointer.
 * - Option B: a "digital screen" plane is overlaid on the face with
 *   glowing eyes that blink and follow the cursor (drawn on a live canvas).
 */

// ── Animated digital face (canvas texture on a plane) ───────────────────────
function FaceScreen() {
  const { pointer } = useThree();

  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 320;
    return c;
  }, []);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.anisotropy = 4;
    return t;
  }, [canvas]);

  const roundRect = (
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
  ) => {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };

  // a cute curved eye (rounded vertical shape), squashed by `open` for blinking
  const drawEye = (
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, w: number, h: number,
  ) => {
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, Math.min(w, h) / 2);
    ctx.fill();
  };

  useFrame((state) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const t = state.clock.getElapsedTime();
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    // dark glossy screen background (covers the baked face)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0b0f17");
    grad.addColorStop(0.5, "#05070c");
    grad.addColorStop(1, "#010204");
    ctx.fillStyle = grad;
    roundRect(ctx, 0, 0, W, H, 150);
    ctx.fill();

    // blink: quick close roughly every 4s
    const cycle = t % 4.2;
    let open = 1;
    if (cycle > 4.0) {
      const p = (cycle - 4.0) / 0.2;
      open = Math.max(0.06, Math.abs(Math.cos(p * Math.PI)));
    }

    // pointer-driven eye offset (look around)
    const ox = THREE.MathUtils.clamp(pointer.x, -1, 1) * 34;
    const oy = THREE.MathUtils.clamp(-pointer.y, -1, 1) * 20;

    const eyeW = 92;
    const eyeH = 128 * open;
    const cy = H * 0.5 + oy;

    // soft outer glow
    ctx.save();
    ctx.shadowColor = "#3bc5ff";
    ctx.shadowBlur = 70;
    ctx.fillStyle = "#9be7ff";
    drawEye(ctx, W * 0.32 + ox, cy, eyeW, eyeH);
    drawEye(ctx, W * 0.68 + ox, cy, eyeW, eyeH);
    ctx.restore();

    // bright inner core of the eyes
    ctx.save();
    ctx.shadowColor = "#dffaff";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#eafbff";
    drawEye(ctx, W * 0.32 + ox, cy, eyeW * 0.5, eyeH * 0.55);
    drawEye(ctx, W * 0.68 + ox, cy, eyeW * 0.5, eyeH * 0.55);
    ctx.restore();

    // glassy top sheen
    const sheen = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sheen.addColorStop(0, "rgba(255,255,255,0.10)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    roundRect(ctx, 0, 0, W, H * 0.55, 150);
    ctx.fill();

    // fade edges into the visor (so it doesn't look like a pasted rectangle)
    ctx.globalCompositeOperation = "destination-in";
    const mask = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, W * 0.56);
    mask.addColorStop(0, "rgba(0,0,0,1)");
    mask.addColorStop(0.72, "rgba(0,0,0,1)");
    mask.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    tex.needsUpdate = true;
  });

  // Positioned just in front of the visor (local model units; scaled by parent)
  return (
    <mesh position={[0, 0.0875, 0.0332]} rotation={[-0.07, 0, 0]}>
      <planeGeometry args={[0.069, 0.0345]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function MascotModel() {
  const { scene } = useGLTF("/mascot.glb");
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  const model = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.metalness = 1.0;
        mat.roughness = 0.22;
        mat.envMapIntensity = 1.6;
        mesh.material = mat;
        mesh.castShadow = true;
      }
    });
    return s;
  }, [scene]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    group.current.position.y = -0.9 + Math.sin(t * 1.2) * 0.06;
    const targetY = pointer.x * 0.5;
    const targetX = -pointer.y * 0.28;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.06;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.06;
  });

  return (
    <group ref={group} scale={13} position={[0, -0.9, 0]}>
      <primitive object={model} />
      <FaceScreen />
    </group>
  );
}

export default function Mascot3D() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.1, 3.2], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <directionalLight position={[-4, 2, -2]} intensity={0.6} color="#ffd9b0" />
      <Suspense fallback={null}>
        <MascotModel />
        <Environment preset="city" />
        <ContactShadows position={[0, -1.15, 0]} opacity={0.35} scale={6} blur={2.6} far={2} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload("/mascot.glb");
