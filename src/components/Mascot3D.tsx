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

  useFrame((state) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const t = state.clock.getElapsedTime();
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    // The texture is ADDITIVE — only the light it draws is added over the
    // original baked face, turning the visor into a glowing tech screen
    // while the original eyes + smile still show through underneath.

    // horizontal scanlines (the classic "screen" feel)
    ctx.strokeStyle = "rgba(90,200,255,0.13)";
    ctx.lineWidth = 1.5;
    for (let y = 0; y < H; y += 7) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }

    // faint vertical grid
    ctx.strokeStyle = "rgba(90,200,255,0.06)";
    for (let x = 0; x < W; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
      ctx.stroke();
    }

    // moving scan band that sweeps down (alive, like a display refreshing)
    const bandY = ((t * 70) % (H + 120)) - 60;
    const band = ctx.createLinearGradient(0, bandY - 50, 0, bandY + 50);
    band.addColorStop(0, "rgba(120,220,255,0)");
    band.addColorStop(0.5, "rgba(150,230,255,0.22)");
    band.addColorStop(1, "rgba(120,220,255,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, bandY - 50, W, 100);

    // subtle flicker so it doesn't feel static
    const flicker = 0.05 + 0.04 * Math.sin(t * 8.0);
    ctx.fillStyle = `rgba(80,190,255,${flicker})`;
    ctx.fillRect(0, 0, W, H);

    // glassy top sheen (reflection on the screen glass)
    const sheen = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    sheen.addColorStop(0, "rgba(255,255,255,0.10)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H * 0.5);

    // fade the edges so the overlay melts into the visor (no hard border)
    ctx.globalCompositeOperation = "destination-in";
    const mask = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.54);
    mask.addColorStop(0, "rgba(0,0,0,1)");
    mask.addColorStop(0.7, "rgba(0,0,0,1)");
    mask.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    tex.needsUpdate = true;
  });

  // A curved patch of a sphere that conforms to the visor surface. Additive
  // blending overlays a glowing tech panel onto the original baked face.
  return (
    <mesh position={[0, 0.088, 0]}>
      <sphereGeometry
        args={[
          0.0418,                   // radius slightly above head surface
          64, 32,
          Math.PI / 2 - 0.6, 1.2,   // phi: horizontal span centered on the front (+Z)
          1.18, 0.46,               // theta: vertical span (visor area)
        ]}
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
