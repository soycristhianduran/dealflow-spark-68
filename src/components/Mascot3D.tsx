import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";


function MascotModel() {
  const { scene } = useGLTF("/mascot.glb");
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  const emissiveMats = useRef<THREE.MeshStandardMaterial[]>([]);

  const model = useMemo(() => {
    const s = scene.clone(true);
    const mats: THREE.MeshStandardMaterial[] = [];
    s.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.metalness = 1.0;
        mat.roughness = 0.22;
        mat.envMapIntensity = 1.6;
        if (mat.emissiveMap || mat.emissiveIntensity > 0) {
          // crank the base glow so the blink (a quick drop) is clearly visible
          mat.emissiveIntensity = 4.0;
          mat.userData.baseEmissive = 4.0;
          mats.push(mat);
        }
        mesh.material = mat;
        mesh.castShadow = true;
      }
    });
    emissiveMats.current = mats;
    return s;
  }, [scene]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    group.current.position.y = -0.9 + Math.sin(t * 1.2) * 0.06;
    const targetY = pointer.x * 0.3;
    const targetX = -pointer.y * 0.18;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.06;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.06;

    // ── bring the face to life: breathing glow + a clear blink ────────────
    let glow = 0.9 + 0.1 * Math.sin(t * 2.0);
    const cycle = t % 3.0;        // blink every 3s
    if (cycle > 2.8) {
      const p = (cycle - 2.8) / 0.2;            // 0..1 over 0.2s
      glow *= Math.max(0.1, Math.abs(Math.cos(p * Math.PI))); // bright→off→bright
    }
    emissiveMats.current.forEach((m) => {
      m.emissiveIntensity = (m.userData.baseEmissive || 4.0) * glow;
    });
  });

  return (
    <group ref={group} scale={13} position={[0, -0.9, 0]}>
      <primitive object={model} />
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
