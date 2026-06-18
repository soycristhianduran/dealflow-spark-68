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
if (!baseTex) throw new Error("no baseColorTexture");

// Decode base color to raw RGBA
const img = baseTex.getImage();
const { data, info } = await sharp(Buffer.from(img))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height } = info;
const out = Buffer.alloc(width * height * 4);

// Keep only the glowing cyan pixels (eyes / smile / chest light); black out the
// metal body and dark visor. Those cyan areas become the emissive "screen".
let kept = 0;
for (let i = 0; i < width * height; i++) {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
  const isCyan = b > 110 && g > 100 && b >= r * 1.15 && g >= r * 0.9;
  if (isCyan) {
    // boost toward a clean bright cyan so it reads as a lit display
    out[i * 4] = Math.min(255, r * 0.7 + 40);
    out[i * 4 + 1] = Math.min(255, g + 20);
    out[i * 4 + 2] = Math.min(255, b + 30);
    out[i * 4 + 3] = 255;
    kept++;
  } else {
    out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 255;
  }
}
console.log(`emissive pixels kept: ${kept} / ${width * height} (${((kept / (width * height)) * 100).toFixed(2)}%)`);

const emissivePng = await sharp(out, { raw: { width, height, channels: 4 } })
  .png()
  .toBuffer();

// Attach as emissive texture sharing the same UVs as base color
const emTex = doc.createTexture("emissive").setImage(emissivePng).setMimeType("image/png");
mat.setEmissiveTexture(emTex);
mat.setEmissiveFactor([1, 1, 1]);

// Make it glow stronger than 1.0
const emStrengthExt = doc.createExtension(KHRMaterialsEmissiveStrength);
mat.setExtension(
  "KHR_materials_emissive_strength",
  emStrengthExt.createEmissiveStrength().setEmissiveStrength(2.2),
);

await io.write(OUT, doc);
console.log("wrote", OUT);
