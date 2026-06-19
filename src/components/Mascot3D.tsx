import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

/**
 * 3D mascot for the Klosify hero.
 * The model's baked face was wiped to a clean black visor, so the face here
 * is a live animated screen: glowing eyes (blink + look toward cursor) + smile,
 * drawn on a canvas and projected onto a curved patch that hugs the visor.
 */

// ── Animated screen face (only light, drawn on the clean black visor) ───────
function FaceScreen() {
  const { pointer } = useThree();
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    return c;
  }, []);
  const tex = useMemo(() => new THREE.CanvasTexture(canvas), [canvas]);

  const drawEye = (
    ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number,
  ) => {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + r, cy - h / 2);
    ctx.arcTo(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r);
    ctx.arcTo(cx + w / 2, cy + h / 2, cx - w / 2, cy + h / 2, r);
    ctx.arcTo(cx - w / 2, cy + h / 2, cx - w / 2, cy - h / 2, r);
    ctx.arcTo(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, r);
    ctx.closePath();
    ctx.fill();
  };

  useFrame((state) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const t = state.clock.getElapsedTime();
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H); // transparent — only the eyes/smile are drawn

    // blink every 3.2s
    const cycle = t % 3.2;
    let open = 1;
    if (cycle > 3.0) open = Math.max(0.06, Math.abs(Math.cos(((cycle - 3.0) / 0.2) * Math.PI)));

    // look toward cursor (within the visor)
    const ox = THREE.MathUtils.clamp(pointer.x, -1, 1) * 26;
    const oy = THREE.MathUtils.clamp(-pointer.y, -1, 1) * 15;

    const cy = H * 0.52 + oy;
    const lx = W * 0.35 + ox;
    const rx = W * 0.65 + ox;
    const eyeW = 84;
    const eyeH = 116 * open;

    // soft glow halo behind each eye
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    [lx, rx].forEach((ex) => {
      const g = ctx.createRadialGradient(ex, cy, 2, ex, cy, 95);
      g.addColorStop(0, "rgba(90,200,255,0.5)");
      g.addColorStop(1, "rgba(90,200,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(ex - 110, cy - 110, 220, 220);
    });
    ctx.restore();

    // eyes: bright cyan + white core
    ctx.save();
    ctx.shadowColor = "#37c4ff";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#9be3ff";
    drawEye(ctx, lx, cy, eyeW, eyeH);
    drawEye(ctx, rx, cy, eyeW, eyeH);
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#f4feff";
    drawEye(ctx, lx, cy, eyeW * 0.44, eyeH * 0.5);
    drawEye(ctx, rx, cy, eyeW * 0.44, eyeH * 0.5);
    ctx.restore();

    // smile
    ctx.save();
    ctx.shadowColor = "#37c4ff";
    ctx.shadowBlur = 26;
    ctx.strokeStyle = "#9be3ff";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(W * 0.5 + ox * 0.6, H * 0.74 + oy * 0.6, 54, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.restore();

    tex.needsUpdate = true;
  });

  // Curved patch hugging the visor; additive so it reads as a lit screen.
  return (
    <mesh position={[0, 0.082, 0]}>
      <sphereGeometry
        args={[0.0422, 64, 32, Math.PI / 2 - 0.6, 1.2, 1.22, 0.52]}
      />
      <meshBasicMaterial
        map={tex}
        transparent
        toneMapped={false}
        depthWrite={false}
        side={THREE.FrontSide}
        blending={THREE.AdditiveBlending}
      />
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
    group.current.position.y = -0.68 + Math.sin(t * 1.2) * 0.06;
    const targetY = pointer.x * 0.3;
    const targetX = -pointer.y * 0.18;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.06;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.06;
  });

  return (
    <group ref={group} scale={13} position={[0, -0.68, 0]}>
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
