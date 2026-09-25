import json, struct, math

buf = open("public/avatar/human.glb", "rb").read()
off = 12
gltf = None
bin_chunk = None
while off < len(buf):
    ln = struct.unpack_from("<I", buf, off)[0]
    ty = struct.unpack_from("<I", buf, off + 4)[0]
    if ty == 0x4E4F534A:
        gltf = json.loads(buf[off + 8: off + 8 + ln].decode("utf-8"))
    elif ty == 0x004E4942:
        bin_chunk = buf[off + 8: off + 8 + ln]
    off += 8 + ln

nodes = gltf["nodes"]
skin = gltf["skins"][0]
acc = gltf["accessors"][skin["inverseBindMatrices"]]
bv = gltf["bufferViews"][acc["bufferView"]]
base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)

joints = skin["joints"]

def ibm(i):
    o = base + i * 64
    v = struct.unpack_from("<16f", bin_chunk, o)
    return [list(v[0:4]), list(v[4:8]), list(v[8:12]), list(v[12:16])]

def invert(m):
    a = [m[0][0], m[0][1], m[0][2], m[0][3],
         m[1][0], m[1][1], m[1][2], m[1][3],
         m[2][0], m[2][1], m[2][2], m[2][3],
         m[3][0], m[3][1], m[3][2], m[3][3]]
    det = (a[0]*(a[5]*a[10]-a[6]*a[9]) - a[1]*(a[4]*a[10]-a[6]*a[8])
           + a[2]*(a[4]*a[9]-a[5]*a[8]))
    if abs(det) < 1e-12:
        return None
    inv = [0.0]*16
    inv[0]  =  (a[5]*a[10]-a[6]*a[9])/det
    inv[1]  = -(a[1]*a[10]-a[2]*a[9])/det
    inv[2]  =  (a[1]*a[6]-a[2]*a[5])/det
    inv[3]  = -(a[0]*a[10]-a[2]*a[8])/det
    inv[4]  = -(a[4]*a[10]-a[6]*a[8])/det
    inv[5]  =  (a[0]*a[10]-a[2]*a[8])/det
    inv[6]  = -(a[0]*a[6]-a[2]*a[4])/det
    inv[7]  =  (a[0]*a[5]-a[1]*a[4])/det
    inv[8]  =  (a[4]*a[9]-a[5]*a[8])/det
    inv[9]  = -(a[0]*a[9]-a[1]*a[8])/det
    inv[10] =  (a[0]*a[8]-a[1]*a[4])/det
    inv[11] = -(a[0]*a[2]-a[1]*a[0])/det
    inv[12] = -(a[4]*a[7]-a[5]*a[6])/det
    inv[13] =  (a[0]*a[7]-a[1]*a[6])/det
    inv[14] = -(a[0]*a[3]-a[1]*a[2])/det
    inv[15] =  (a[0]*a[0]-a[1]*a[1])/det
    return [[inv[0],inv[1],inv[2],inv[3]],[inv[4],inv[5],inv[6],inv[7]],
            [inv[8],inv[9],inv[10],inv[11]],[inv[12],inv[13],inv[14],inv[15]]]

def bone_pos(name):
    if name not in [nodes[j].get("name") for j in joints]:
        for k, n in enumerate(nodes):
            if n.get("name") == name and k in joints:
                pass
        return None
    idx = [j for j in joints if nodes[j].get("name") == name]
    if not idx:
        return None
    j = idx[0]
    m = invert(ibm(j))
    if not m:
        return None
    return [m[0][3], m[1][3], m[2][3]]

def dist(a, b):
    return math.dist(a, b)

print("=== real bone positions (from inverseBindMatrices) ===")
for n in ["Hips_01", "Neck_05", "Neck1_06", "Head_08", "LeftEye_09", "RightEye_010",
          "HeadTop_End_011", "LeftArm_013", "RightArm_039",
          "LeftForeArm_014", "RightForeArm_040",
          "LeftHand_017", "RightHand_043"]:
    p = bone_pos(n)
    print("   %-18s %s" % (n, [round(v, 4) for v in p] if p else "NOT A JOINT"))

ls, rs = bone_pos("LeftArm_013"), bone_pos("RightArm_039")
le, re_ = bone_pos("LeftForeArm_014"), bone_pos("RightForeArm_040")
lh, rh = bone_pos("LeftHand_017"), bone_pos("RightHand_043")
head, eyeL, eyeR = bone_pos("Head_08"), bone_pos("LeftEye_09"), bone_pos("RightEye_010")

if ls and rs:
    print("\n=== model metrics ===")
    print("   shoulder span  = %.4f m" % dist(ls, rs))
    print("   shoulder mid Y = %.4f m" % ((ls[1]+rs[1])/2))
if le and lh and ls:
    print("   upper arm L    = %.4f m" % dist(ls, le))
if le and lh:
    print("   forearm L      = %.4f m" % dist(le, lh))
if head:
    print("   head centre    = %s" % [round(v,4) for v in head])
if eyeL and eyeR:
    fc = [(eyeL[i]+eyeR[i])/2 for i in range(3)]
    print("   eye midpoint   = %s  <- good FACE_CENTER" % [round(v,4) for v in fc])
    print("   eye separation = %.4f m" % dist(eyeL, eyeR))
