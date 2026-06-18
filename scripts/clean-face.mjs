import { NodeIO } from "@gltf-transform/core";
import { KHRMaterialsEmissiveStrength } from "@gltf-transform/extensions";
import sharp from "sharp";

const SRC = process.argv[2];
const OUT = process.argv[3];

const io = new NodeIO().registerExtensions([KHRMaterialsEmissiveStrength]);
const doc = await io.read(SRC);
const root = doc.getRoot();
const mat = root.listMaterials()[0];

const baseTex = mat.getBaseColorTexture();
const img = baseTex.getImage();
const { data, info } = await sharp(Buffer.from(img)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

// Paint the cyan face pixels (eyes/smile/light) to the dark visor color so the
// baked face disappears → clean black visor for the animated screen overlay.
let cleaned = 0;
for (let i = 0; i < width * height; i++) {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
  // catch even dark teal/cyan remnants of the old face (blue/green dominant)
  const isCyan = b > 30 && b >= r * 1.04 && b >= g * 0.78 && g >= r * 0.72;
  if (isCyan) {
    data[i * 4] = 9; data[i * 4 + 1] = 12; data[i * 4 + 2] = 17;
    cleaned++;
  }
}
console.log(`cleaned cyan pixels: ${cleaned}`);

const newBase = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
baseTex.setImage(newBase).setMimeType("image/png");

// strip any emissive
mat.setEmissiveTexture(null);
mat.setEmissiveFactor([0, 0, 0]);
mat.setExtension("KHR_materials_emissive_strength", null);

await io.write(OUT, doc);
console.log("wrote", OUT);
