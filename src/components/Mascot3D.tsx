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
    c.height = 256;
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

  const drawEye = (
    ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number,
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

    // ── This IS the screen surface (opaque), not a light on top ──────────
    // Dark OLED-style display background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a1019");
    bg.addColorStop(0.5, "#04070d");
    bg.addColorStop(1, "#010305");
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, W, H, 150);
    ctx.fill();

    // scanlines baked INTO the screen
    ctx.strokeStyle = "rgba(120,210,255,0.05)";
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }

    // slow scan sweep (display refreshing)
    const bandY = ((t * 60) % (H + 140)) - 70;
    const band = ctx.createLinearGradient(0, bandY - 55, 0, bandY + 55);
    band.addColorStop(0, "rgba(120,220,255,0)");
    band.addColorStop(0.5, "rgba(130,225,255,0.07)");
    band.addColorStop(1, "rgba(120,220,255,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, bandY - 55, W, 110);

    // blink
    const cycle = t % 4.2;
    let open = 1;
    if (cycle > 4.0) open = Math.max(0.07, Math.abs(Math.cos(((cycle - 4.0) / 0.2) * Math.PI)));

    // eyes follow the cursor subtly (alive)
    const ox = THREE.MathUtils.clamp(pointer.x, -1, 1) * 20;
    const oy = THREE.MathUtils.clamp(-pointer.y, -1, 1) * 11;

    const cy = H * 0.42 + oy;
    const lx = W * 0.34 + ox;
    const rx = W * 0.66 + ox;
    const eyeW = 86;
    const eyeH = 110 * open;

    // ambient screen glow behind the eyes
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    [lx, rx].forEach((ex) => {
      const g = ctx.createRadialGradient(ex, cy, 4, ex, cy, 110);
      g.addColorStop(0, "rgba(70,190,255,0.30)");
      g.addColorStop(1, "rgba(70,190,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(ex - 120, cy - 120, 240, 240);
    });
    ctx.restore();

    // eyes — glow + bright core
    ctx.save();
    ctx.shadowColor = "#37c4ff";
    ctx.shadowBlur = 55;
    ctx.fillStyle = "#8fe1ff";
    drawEye(ctx, lx, cy, eyeW, eyeH);
    drawEye(ctx, rx, cy, eyeW, eyeH);
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#f2feff";
    drawEye(ctx, lx, cy, eyeW * 0.46, eyeH * 0.5);
    drawEye(ctx, rx, cy, eyeW * 0.46, eyeH * 0.5);
    ctx.restore();

    // smile
    ctx.save();
    ctx.shadowColor = "#37c4ff";
    ctx.shadowBlur = 30;
    ctx.strokeStyle = "#8fe1ff";
    ctx.lineWidth = 13;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(W * 0.5 + ox * 0.6, H * 0.62 + oy * 0.6, 60, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();
    ctx.restore();

    // glassy top sheen
    const sheen = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    sheen.addColorStop(0, "rgba(255,255,255,0.08)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    roundRect(ctx, 0, 0, W, H * 0.5, 150);
    ctx.fill();

    // fade edges into the black visor so the whole area reads as the screen
    ctx.globalCompositeOperation = "destination-in";
    const mask = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, W * 0.52);
    mask.addColorStop(0, "rgba(0,0,0,1)");
    mask.addColorStop(0.78, "rgba(0,0,0,1)");
    mask.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    tex.needsUpdate = true;
  });

  // Curved patch that conforms to the visor and BECOMES the screen surface.
  return (
    <mesh position={[0, 0.088, 0]}>
      <sphereGeometry
        args={[
          0.0418,
          64, 32,
          Math.PI / 2 - 0.64, 1.28, // phi: horizontal span over the visor
          1.14, 0.54,               // theta: vertical span over the visor
        ]}
      />
      <meshBasicMaterial
        map={tex}
        transparent
        toneMapped={false}
        depthWrite={false}
        side={THREE.FrontSide}
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
    group.current.position.y = -0.9 + Math.sin(t * 1.2) * 0.06;
    const targetY = pointer.x * 0.38;
    const targetX = -pointer.y * 0.22;
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
