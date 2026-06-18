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
          mat.userData.baseEmissive = mat.emissiveIntensity || 2.2;
          // let the glowing eyes "look around" by nudging the emissive UVs
          if (mat.emissiveMap) {
            mat.emissiveMap.wrapS = THREE.ClampToEdgeWrapping;
            mat.emissiveMap.wrapT = THREE.ClampToEdgeWrapping;
          }
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
    const targetY = pointer.x * 0.38;
    const targetX = -pointer.y * 0.22;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.06;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.06;

    // ── bring the face to life ────────────────────────────────────────────
    // breathing glow
    let intensity = 0.85 + 0.15 * Math.sin(t * 1.8);
    // blink: a quick dim of the glow every ~3.6s
    const cycle = t % 3.6;
    if (cycle > 3.42) {
      const p = (cycle - 3.42) / 0.18;
      intensity *= Math.max(0.06, Math.abs(Math.cos(p * Math.PI)));
    }
    // subtle "look around": shift the glowing eyes within the dark visor
    const ux = -THREE.MathUtils.clamp(pointer.x, -1, 1) * 0.012;
    const uy = THREE.MathUtils.clamp(pointer.y, -1, 1) * 0.008;
    emissiveMats.current.forEach((m) => {
      m.emissiveIntensity = (m.userData.baseEmissive || 2.2) * intensity;
      if (m.emissiveMap) m.emissiveMap.offset.set(ux, uy);
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
