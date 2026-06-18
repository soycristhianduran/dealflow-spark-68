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

    // dark glossy screen background (covers the baked face)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0a0d14");
    grad.addColorStop(1, "#020306");
    ctx.fillStyle = grad;
    roundRect(ctx, 0, 0, W, H, 110);
    ctx.fill();

    // blink: quick close roughly every 4s
    const cycle = t % 4.2;
    let open = 1;
    if (cycle > 4.0) {
      const p = (cycle - 4.0) / 0.2; // 0..1
      open = Math.abs(Math.cos(p * Math.PI)); // 1→0→1
      open = Math.max(0.07, open);
    }

    // pointer-driven eye offset (look around)
    const ox = THREE.MathUtils.clamp(pointer.x, -1, 1) * 30;
    const oy = THREE.MathUtils.clamp(-pointer.y, -1, 1) * 18;

    const eyeW = 70;
    const eyeH = 96 * open;
    const cy = H * 0.46 + oy;

    ctx.save();
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 45;
    ctx.fillStyle = "#8fe0ff";
    drawEye(ctx, W * 0.33 + ox, cy, eyeW, eyeH);
    drawEye(ctx, W * 0.67 + ox, cy, eyeW, eyeH);
    ctx.restore();

    tex.needsUpdate = true;
  });

  // Positioned just in front of the visor (local model units; scaled by parent)
  return (
    <mesh position={[0, 0.086, 0.0336]} rotation={[-0.08, 0, 0]}>
      <planeGeometry args={[0.06, 0.0375]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
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
    group.current.position.y = -1.05 + Math.sin(t * 1.2) * 0.06;
    const targetY = pointer.x * 0.5;
    const targetX = -pointer.y * 0.28;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.06;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.06;
  });

  return (
    <group ref={group} scale={13} position={[0, -1.05, 0]}>
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
