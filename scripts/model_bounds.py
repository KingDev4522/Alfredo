import json, struct

buf = open("public/avatar/human.glb", "rb").read()
off = 12
gltf = None
while off < len(buf):
    ln = struct.unpack_from("<I", buf, off)[0]
    ty = struct.unpack_from("<I", buf, off + 4)[0]
    if ty == 0x4E4F534A:
        gltf = json.loads(buf[off + 8: off + 8 + ln].decode("utf-8"))
        break
    off += 8 + ln

print("asset:", gltf.get("asset"))
print("scenes:", [s.get("name") for s in gltf.get("scenes", [])])

# Root node transforms
for i, s in enumerate(gltf.get("scenes", [])):
    for n in s.get("nodes", []):
        node = gltf["nodes"][n]
        print("scene %d root node %d: name=%r scale=%s translation=%s rotation=%s"
              % (i, n, node.get("name"), node.get("scale"), node.get("translation"), node.get("rotation")))

# Mesh bounds straight from accessor min/max (authoritative, no transform guessing)
print("\nmesh POSITION accessor bounds (native GLB units):")
for mi, mesh in enumerate(gltf.get("meshes", [])):
    for pi, prim in enumerate(mesh.get("primitives", [])):
        acc = gltf["accessors"][prim["attributes"]["POSITION"]]
        if "min" in acc and "max" in acc:
            mn, mx = acc["min"], acc["max"]
            size = [mx[i] - mn[i] for i in range(3)]
            print("  mesh %d prim %d: min=%s max=%s" % (mi, pi,
                  [round(v, 4) for v in mn], [round(v, 4) for v in mx]))
            print("      size  = %s" % [round(v, 4) for v in size])
            print("      HEIGHT= %.4f units" % size[1])
            break
    if mi > 2:
        break

# Any node-level scale anywhere in the tree that would rescale the model?
print("\nnon-identity node scales in the scene graph:")
def walk(i, depth=0, inherited=1.0):
    n = gltf["nodes"][i]
    s = n.get("scale", [1, 1, 1])
    cur = inherited * (s[0] if abs(s[0] - 1) > 1e-6 else 1)
    if any(abs(v - 1) > 1e-6 for v in s):
        print("   %s%s scale=%s" % ("  " * depth, n.get("name"), s))
    for c in n.get("children", []):
        walk(c, depth + 1, cur)

for s in gltf.get("scenes", []):
    for n in s.get("nodes", []):
        walk(n)
