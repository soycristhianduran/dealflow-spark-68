import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

/**
 * 3D mascot (Meshy-generated robot) for the Klosify hero.
 * - Polished metal look (low roughness + env reflections).
 * - Idle float + gentle rotation toward the pointer (feels "alive").
 * The face/eyes are baked into the texture (single mesh), so eye motion
 * is simulated by having the whole head subtly track the cursor.
 */

function MascotModel() {
  const { scene } = useGLTF("/mascot.glb");
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  // Clone + tune the material once: shiny metal that reflects the environment.
  const model = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.metalness = 1.0;       // fully metallic
        mat.roughness = 0.22;      // low = polished / "fine" metal
        mat.envMapIntensity = 1.6; // strong reflections = premium shine
        mesh.material = mat;
        mesh.castShadow = true;
      }
    });
    return s;
  }, [scene]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    // Idle vertical float
    group.current.position.y = -1.05 + Math.sin(t * 1.2) * 0.06;
    // Gentle look-at-pointer: ease rotation toward cursor
    const targetY = pointer.x * 0.5;
    const targetX = -pointer.y * 0.28;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.06;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.06;
  });

  // Model is ~0.12 units tall → scale up to fill the frame
  return (
    <group ref={group} scale={11} position={[0, -1.05, 0]}>
      <primitive object={model} />
    </group>
  );
}

export default function Mascot3D() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.1, 3.2], fov: 38 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <directionalLight position={[-4, 2, -2]} intensity={0.6} color="#ffd9b0" />
      <Suspense fallback={null}>
        <MascotModel />
        {/* Reflections for the metal — invisible HDRI environment */}
        <Environment preset="city" />
        <ContactShadows position={[0, -1.15, 0]} opacity={0.35} scale={6} blur={2.6} far={2} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload("/mascot.glb");
