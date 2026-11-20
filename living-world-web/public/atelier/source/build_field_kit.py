"""Build the Shanhe tabletop kit with Mixar (verified in 4.4.7) or Blender.

Mixar -b -P tools/art/build_field_kit.py -- --out public/atelier
Mixar -b public/atelier/source/field-kit.mixar -P tools/art/build_field_kit.py -- --out public/atelier --export-existing --asset house
A Python environment with Blender's bpy wheel can run this file directly as well.
The output uses metres, glTF Y-up, +Z front. All artwork is generated locally.
"""
import argparse
import json
import math
import shutil
import struct
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Vector

# Display swatches in sRGB; Blender and glTF use scene-linear material factors.
PALETTE = {
    "blockout": "B2B0A4", "faction_cloth": "BD4639", "ink": "202C32", "hair": "302B2A",
    "skin": "C18A62", "skin_light": "D99E72", "leather": "694638", "dark_leather": "493834",
    "linen": "E1D3AA", "cream": "EFE3C5", "brass": "C59954", "steel": "839496",
    "blade": "B8C7C3", "blue": "445E6F", "blue_lite": "5F7B86", "navy": "344B59",
    "sage": "667C64", "moss": "465F53", "teal": "47716E", "jade": "6F9081",
    "wood": "855937", "wood_light": "AB7F50", "timber": "553C31",
    "wall": "D9C9A6", "whitewash": "E5DCC2", "tile": "495F63", "tile_glaze": "6B8181",
    "roof_shadow": "33494D", "lantern": "D77249", "window": "3B4946", "stone": "777C73",
    "slate": "515F60", "limestone": "999D8C", "pine": "365C4B", "pine_mid": "47735A",
    "pine_tip": "668463", "gold": "DCB76B", "paper": "E9C78F",
}
METALS = {"steel", "blade", "brass", "gold"}

def linear(channel):
    value = int(channel, 16) / 255
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4

def color(name):
    hex_code = PALETTE[name]
    return [linear(hex_code[i:i+2]) for i in (0, 2, 4)] + [1.]

@dataclass
class Part:
    name: str
    mat: str
    vertices: list
    faces: list
    group: str

class Model:
    def __init__(self, rough=False):
        self.rough = rough
        self.parts = []
        self.group = "body"
        self.pivots = {"body": Vector((0., 0., 0.))}

    def add(self, name, mat, vertices, faces):
        verts = [Vector(point) for point in vertices]
        center = sum(verts, Vector((0, 0, 0))) / len(verts)
        fixed = []
        for face in faces:
            a, b, c = (verts[i] for i in face[:3])
            # All individual pieces are convex. Order faces outward for flat shading.
            middle = sum((verts[i] for i in face), Vector((0, 0, 0))) / len(face)
            fixed.append(tuple(reversed(face)) if (b-a).cross(c-a).dot(middle-center) < 0 else tuple(face))
        self.parts.append(Part(name, "blockout" if self.rough else mat, verts, fixed, self.group))

    def box(self, name, mat, pos, dimensions):
        x, y, z = pos
        a, b, c = (size/2 for size in dimensions)
        self.add(name, mat, [(x+i*a, y+j*b, z+k*c) for k in (-1, 1) for j in (-1, 1) for i in (-1, 1)],
                 [(0, 1, 3, 2), (4, 5, 7, 6), (0, 1, 5, 4), (1, 3, 7, 5), (3, 2, 6, 7), (2, 0, 4, 6)])

    def rings(self, name, mat, sections, sides=8, phase=None):
        """Stack elliptical cross sections (x, y, z, radius_x, radius_y)."""
        phase = math.pi/sides if phase is None else phase
        vertices = [(x+rx*math.cos(phase+i*math.tau/sides), y+ry*math.sin(phase+i*math.tau/sides), z)
                    for x,y,z,rx,ry in sections for i in range(sides)]
        top = (len(sections)-1)*sides
        faces = [list(range(sides)), list(range(top, top+sides))]
        for layer in range(len(sections)-1):
            a = layer*sides
            for i in range(sides):
                j = (i+1) % sides
                faces.append((a+i, a+j, a+sides+j, a+sides+i))
        self.add(name, mat, vertices, faces)

    def oval(self, name, mat, pos, size, sides=8):
        x,y,z=pos
        a,b,c=size
        self.rings(name, mat, [(x,y,z+c*h,a*r,b*r) for h,r in [(-1,.34),(-.49,.87),(.21,1.),(.76,.69),(1,.25)]], sides)

    def rod(self, name, mat, a, b, r1, r2=None, n=8):
        a,b=Vector(a),Vector(b)
        r2=r1 if r2 is None else r2
        axis=(b-a).normalized()
        up=Vector((1,0,0)) if abs(axis.x) < .8 else Vector((0,1,0))
        u=axis.cross(up).normalized()
        v=axis.cross(u)
        vertices=[p+r*(u*math.cos((i+.5)*math.tau/n)+v*math.sin((i+.5)*math.tau/n)) for p,r in ((a,r1),(b,r2)) for i in range(n)]
        self.add(name, mat, vertices, [tuple(range(n)),tuple(range(n,2*n))]+[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)])

    def panel(self, name, mat, outline, front_y, depth):
        """Hand-cut decorative panel with an x/z outline."""
        n=len(outline)
        self.add(name, mat, [(x,y,z) for y in (front_y,front_y+depth) for x,z in outline],
                 [tuple(range(n)),tuple(range(n,2*n))]+[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)])

    def bounds(self):
        points=[point for part in self.parts for point in part.vertices]
        return [min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]

def figure(role, rough):
    m=Model(rough)
    coat={"sword":"blue","guard":"navy","bow":"sage","priest":"linen"}[role]
    trim={"sword":"linen","guard":"steel","bow":"moss","priest":"teal"}[role]
    bulk=1.13 if role=="guard" else .95 if role=="bow" else 1.
    for side in (-1,1):
        x=side*.145
        m.rings("trouser", "ink", [(x,0,.15,.092,.093),(x,.015,.50,.106,.095),(x*.78,.012,.78,.107,.102)])
        m.rings("marching boot", "dark_leather", [(x,-.052,0,.114,.159),(x,-.05,.093,.12,.16),(x,.008,.20,.097,.10),(x,.012,.32,.103,.103)])
        if not rough:
            m.rings("boot binding", "leather", [(x,0,.255,.104,.103),(x,0,.28,.104,.105)])
    hem=.38 if role=="priest" else .63
    m.rings("field tunic",coat,[(0,0,hem,.296*bulk,.19),(0,.012,.83,.243*bulk,.161),(0,0,1.16,.30*bulk,.188),(0,.013,1.29,.27*bulk,.163)])
    m.rings("neck","skin",[(0,0,1.24,.107,.106),(0,-.018,1.46,.11,.102)])
    m.oval("cheeks","skin_light",(0,-.014,1.515),(.189,.165,.208),10)
    m.rings("hairline","hair",[(0,.001,1.558,.198,.16),(0,.01,1.663,.199,.18),(0,.024,1.71,.14,.13)])
    if not rough:
        for s in (-1,1):
            m.oval("ear","skin",(s*.174,-.013,1.518),(.036,.037,.056))
            m.box("eye","ink",(s*.076,-.171,1.546),(.035,.014,.019))
            m.rod("brow","hair",(s*.038,-.168,1.571),(s*.107,-.158,1.577),.009,n=5)
        m.oval("nose","skin",(0,-.177,1.508),(.032,.036,.038),6)
        m.box("mouth","leather",(0,-.163,1.459),(.053,.01,.008))
        m.rings("wrapped sash","faction_cloth",[(0,-.002,.83,.261*bulk,.18),(0,-.002,.9,.26*bulk,.181)])
        m.box("belt clasp","brass",(0,-.17*bulk,.864),(.077,.028,.064))
        m.box("field satchel","leather",(.214,.073,.75),(.143,.155,.169))
        m.box("satchel flap","wood_light",(.214,-.009,.795),(.131,.024,.052))
    # Headgear and outer garment establish each silhouette even from above.
    if role=="sword":
        m.rings("travel cap","navy",[(0,0,1.617,.201,.183),(0,.012,1.69,.205,.188),(-.042,.027,1.772,.13,.124),(-.079,.028,1.785,.069,.068)])
        m.rings("scarf collar","faction_cloth",[(0,0,1.239,.206,.16),(0,-.013,1.343,.141,.123)])
        if not rough:
            m.panel("scarf tail","faction_cloth",[(-.135,1.315),(-.041,1.27),(-.139,1.012),(-.224,1.069)],-.179,.024)
            m.rod("shoulder strap","leather",(-.205,-.147,1.251),(.159,-.161,.891),.032,n=4)
            m.box("cap pin","brass",(0,-.174,1.68),(.05,.014,.038))
    elif role=="guard":
        m.rings("iron helmet","steel",[(0,.001,1.596,.225,.202),(0,.006,1.697,.221,.201),(0,.019,1.778,.144,.123),(0,.024,1.802,.05,.056)])
        m.rings("helmet brim","navy",[(0,0,1.592,.243,.215),(0,0,1.619,.247,.224)])
        m.panel("breastplate","blue_lite",[(-.22,1.249),(.22,1.249),(.208,1.031),(0,.935),(-.208,1.031)],-.179,.075)
        if not rough:
            for s in (-1,1):
                m.oval("ear guard","steel",(s*.18,.003,1.539),(.052,.103,.101))
                m.rod("cuirass rib","steel",(s*.181,-.196,1.138),(0,-.205,1.04),.018,n=4)
            m.box("helmet badge","brass",(0,-.216,1.621),(.076,.019,.039))
    elif role=="bow":
        m.rings("ranger hood","moss",[(0,.079,1.374,.192,.107),(0,.052,1.631,.221,.176),(.018,.076,1.736,.169,.14),(.067,.158,1.783,.071,.083)])
        m.rings("hood cowl","sage",[(0,.009,1.205,.344,.199),(0,-.004,1.312,.215,.157),(0,0,1.367,.169,.139)])
        if not rough:
            m.rod("quiver","leather",(-.04,.18,.902),(-.243,.19,1.429),.079,.096)
            for i in range(3):
                x=-.235+i*.047
                m.rod("quiver arrow","wood_light",(x+.04,.19,1.33),(x-.04,.19,1.558+i*.023),.008,n=5)
                m.oval("fletching","linen",(x-.025,.19,1.523+i*.023),(.021,.017,.063),5)
    else:
        m.rings("traveller cap","cream",[(0,.008,1.61,.205,.172),(0,.014,1.683,.209,.19),(0,.023,1.756,.145,.12),(0,.025,1.783,.092,.076)])
        for s in (-1,1):
            m.panel("woven stole",trim,[(s*.082,1.295),(s*.186,1.254),(s*.144,.557),(s*.052,.582)],-.176,.023)
            if not rough:
                m.box("stole embroidery","gold",(s*.102,-.189,.632),(.087,.017,.027))
        if not rough:
            m.box("medicine case","teal",(.241,.04,.739),(.178,.132,.205))
            m.box("case emblem","linen",(.247,-.034,.741),(.074,.01,.026))
            m.box("case emblem","linen",(.247,-.034,.741),(.025,.012,.074))
    for side,group in [(-1,"arm_r"),(1,"arm_l")]:
        shoulder=(side*.264*bulk,0,1.227)
        elbow=(side*.375,-.022,1.057)
        hand=(side*.388,-.141,.925)
        if role=="bow" and side==1: hand=(.453,-.189,1.041)
        if role=="guard" and side==1: hand=(.39,-.233,1.031)
        if role=="priest" and side==-1: hand=(-.433,-.152,1.039)
        m.group=group; m.pivots[group]=Vector(shoulder)
        m.rod("upper sleeve",coat,shoulder,elbow,.133,.097)
        m.rod("cuff",trim,elbow,hand,.09,.069)
        m.oval("hand","skin_light",hand,(.079,.077,.081))
        if not rough:
            m.oval("shoulder cape" if role!="guard" else "pauldron",trim,(shoulder[0],0,1.251),(.158,.156,.092))
        x,y,z=hand
        if role=="sword" and side==-1:
            m.rod("sword grip","dark_leather",(x+.025,y,z-.101),(x-.025,y,z+.106),.032,n=7)
            m.rod("crossguard","brass",(x-.156,y,z+.079),(x+.091,y,z+.137),.025,n=6)
            tip=(x-.188,z+.778)
            m.panel("blade","blade",[(x-.073,z+.105),(x+.014,z+.124),(tip[0]+.049,tip[1]-.104),tip],y-.026,.047)
            if not rough:
                m.rod("blade ridge","steel",(x-.028,y-.03,z+.125),(tip[0]+.019,y-.026,tip[1]-.081),.009,.003,n=4)
            m.oval("pommel","brass",(x+.027,y,z-.118),(.046,.043,.043))
        if role=="guard" and side==1:
            outline=[(-.195,.31),(.192,.31),(.246,.214),(.202,-.187),(0,-.383),(-.201,-.189),(-.24,.212)]
            def shield(name,mat,scale,fy):
                m.panel(name,mat,[(x+a*scale,z+b*scale) for a,b in outline],fy,.043)
            shield("shield rim","brass",1.,y-.111)
            if not rough:
                shield("shield enamel","teal",.89,y-.127)
                m.panel("shield blazon","linen",[(x-.116,z+.018),(x,z+.152),(x+.117,z+.018),(x,z-.129)],y-.147,.015)
                m.oval("shield boss","brass",(x,y-.155,z+.015),(.053,.033,.057))
        if role=="bow" and side==1:
            arc=[(x-.027,y+.015,z-.49),(x+.082,y-.045,z-.383),(x+.142,y-.085,z-.16),(x+.143,y-.09,z+.108),(x+.081,y-.046,z+.32),(x-.034,y+.015,z+.437)]
            arc=[(ax-.133,ay+.066,az) for ax,ay,az in arc]
            for a,b in zip(arc,arc[1:]): m.rod("bow limb","wood_light",a,b,.023,n=7)
            m.rod("bow string","linen",arc[0],arc[-1],.005,n=4)
            m.rod("bow grip","leather",arc[2],arc[3],.029,n=7)
        if role=="priest" and side==-1:
            m.rod("lantern staff","wood",(x+.024,y,.12),(x-.044,y,1.712),.028,.023)
            cx=x-.044
            m.rod("staff crossbar","brass",(cx-.105,y,1.713),(cx+.087,y,1.713),.023,n=5)
            m.rings("lantern","paper",[(cx-.096,y,1.457,.052,.05),(cx-.096,y,1.487,.076,.065),(cx-.096,y,1.576,.074,.062),(cx-.096,y,1.61,.044,.042)],6)
            m.rod("lantern cord","brass",(cx-.096,y,1.608),(cx-.096,y,1.709),.011,n=5)
    return m

def village(rough):
    m=Model(rough)
    m.box("fieldstone sill","stone",(0,0,.13),(2.82,1.99,.26))
    m.box("whitewashed walls","whitewash",(0,0,.91),(2.64,1.85,1.43))
    m.box("porch plinth","limestone",(0,-1.052,.112),(1.15,.37,.224))
    m.box("threshold","stone",(0,-1.22,.057),(1.27,.25,.114))
    # Fill both gable ends and the gap between the masonry and rafters.
    cross_section=[(-.925,1.604),(.925,1.604),(.925,1.834),(0,2.381),(-.925,1.834)]
    m.add("gable walls","wall",[(x,y,z) for x in (-1.32,1.32) for y,z in cross_section],
          [(0,1,2,3,4),(5,6,7,8,9)]+[(i,(i+1)%5,5+(i+1)%5,5+i) for i in range(5)])
    def roof(name,mat,y0,z0,y1,z1,width,thick):
        verts=[(x,y,z+t) for t in (-thick,0) for y,z in ((y0,z0),(y1,z1)) for x in (-width/2,width/2)]
        m.add(name,mat,verts,[(0,1,3,2),(4,5,7,6),(0,1,5,4),(2,3,7,6),(0,2,6,4),(1,3,7,5)])
    # Ridge parallel to the façade. Lifted outer eaves soften the silhouette.
    for s in (-1,1):
        roof("hipped roof slope","tile",0,2.43,s*.885,1.917,3.05,.094)
        roof("eave flare","roof_shadow",s*.885,1.917,s*1.19,1.843,3.26,.089)
    m.box("lintel","timber",(0,-.95,1.536),(2.72,.13,.145))
    m.box("entry","timber",(0,-.946,.748),(.614,.11,1.073))
    m.box("door","wood",(0,-1.00,.746),(.474,.06,.945))
    for x in (-1.25,1.25):
        m.box("corner post","timber",(x,-.952,.901),(.119,.122,1.393))
    if not rough:
        for s in (-1,1):
            for i in range(-10,11):
                x=i*.146
                m.rod("tile roll","tile_glaze",(x,0,2.441),(x,s*.887,1.93),.029,n=5)
                m.rod("eave tile","tile",(x,s*.883,1.932),(x,s*1.196,1.855),.029,.036,n=5)
            for x in (-1.53,1.53):
                m.rod("ridge finial","tile_glaze",(x,0,2.435),(x*1.066,0,2.516),.079,.054)
        m.rod("ridge tiles","tile_glaze",(-1.56,0,2.442),(1.56,0,2.442),.078)
        for x in (-.838,.838):
            m.box("window sill","timber",(x,-.98,.791),(.49,.113,.063))
            m.box("shadowed window","window",(x,-.947,1.017),(.451,.077,.424))
            for dx in (-.216,-.072,.072,.216): m.box("window lattice","wood_light",(x+dx,-.997,1.018),(.025,.033,.422))
            for dz in (-.198,0,.198): m.box("window lattice","wood_light",(x,-1.000,1.018+dz),(.452,.032,.025))
        for x in (-.162,-.06,.06,.162): m.box("door plank","wood_light",(x,-1.039,.746),(.008,.01,.907))
        m.box("door sign","faction_cloth",(0,-1.031,1.36),(.45,.031,.096))
        m.box("door sign inset","brass",(0,-1.05,1.36),(.176,.009,.018))
        for x in (-.412,.412):
            m.rod("hanging cord","dark_leather",(x,-1.034,1.522),(x,-1.034,1.358),.011)
            m.oval("porch lantern","lantern",(x,-1.034,1.268),(.089,.075,.097))
            m.box("lantern tassel","gold",(x,-1.034,1.14),(.017,.017,.074))
        for y in (-.857,.857):
            for x in (-1.312,1.312):
                m.box("side framing","timber",(x,y,.895),(.102,.135,1.393))
        for x in (-1.335,1.335):
            m.box("side rail","wood",(x,0,.948),(.058,1.81,.076))
            m.rod("gable brace","wood",(x,-.84,1.67),(x,.0,2.321),.061,n=4)
            m.rod("gable brace","wood",(x,.0,2.321),(x,.84,1.67),.061,n=4)
        for x in (-.552,.551):
            m.oval("rain jar","slate",(x,-1.027,.311),(.12,.113,.156))
    return m

def pine(rough):
    m=Model(rough)
    m.rod("trunk","timber",(-.04,0,0),(.051,0,2.517),.17,.076,9)
    for x,y in [(-.31,-.06),(.22,-.23),(.16,.21),(-.23,.18)]:
        m.rod("exposed root","wood",(0,0,.182),(x,y,.027),.098,.019,6)
    for i,(cx,cy,z,rad,high) in enumerate([(-.09,.02,.75,.98,1.22),(.083,-.044,1.37,.85,1.12),(-.017,.038,1.96,.639,.97),(.042,0,2.40,.43,.86)]):
        sides=7 if rough else 10
        ring=[]
        for layer in range(3):
            for j in range(sides):
                angle=j*math.tau/sides+.31*i
                variation=1.+.086*math.sin(j*7.31+i*5.17)
                r=rad*[.83,1.,.065][layer]*variation
                ring.append((cx+r*math.cos(angle),cy+r*math.sin(angle),z+[.024,.24,high][layer]+.09*math.sin(j*4.5+i)*[1.,.55,.06][layer]))
        faces=[list(range(sides)),list(range(2*sides,3*sides))]
        for j in range(sides):
            k=(j+1)%sides
            faces.extend([(j,k,sides+k,sides+j),(sides+j,sides+k,2*sides+k,2*sides+j)])
        m.add("pine whorl",["pine","pine_mid","pine","pine_tip"][i],ring,faces)
    if not rough:
        for side in (-1,1):
            m.rod("lower bough","wood",(0,0,.51),(side*.603,.033,1.084),.074,.027,6)
            m.rod("bark seam","wood",(-.063,-.104,.148),(side*.029,-.114,.72),.022,.013,4)
    return m

def crossing(rough):
    m=Model(rough)
    for x in (-1.47,1.47):
        m.box("river pier","stone",(x,0,.204),(.54,1.45,.408))
        m.box("capstone","limestone",(x,0,.404),(.64,1.52,.125))
    for y in (-.535,.535):
        m.rod("stringer","timber",(-1.71,y,.46),(1.71,y,.46),.095,n=4)
        for x in (-1.45,0,1.45):
            m.rod("rail post","wood",(x,y,.472),(x,y,1.102),.058,n=6)
            if not rough: m.oval("post cap","wood_light",(x,y,1.105),(.072,.073,.045))
        m.rod("handrail","wood_light",(-1.67,y,1.016),(1.67,y,1.016),.047,n=6)
        if not rough:
            for x1,x2 in [(-1.44,0.),(0.,1.44)]:
                m.rod("cross brace","wood",(x1,y,.602),(x2,y,.93),.034,n=5)
    if rough:
        m.box("bridge deck","wood",(.0,0,.536),(3.62,1.18,.115))
    else:
        for j in range(17):
            x=(j-8)*.215
            m.box("deck board",["wood_light","wood_light","wood"][j%3],(x,0,.549-.025*(abs(j-8)/8)),(.204,1.198,.101))
            if j%2==0:
                for y in (-.435,.435):
                    m.rod("peg","timber",(x,y,.566-.025*(abs(j-8)/8)),(x,y,.603-.025*(abs(j-8)/8)),.019,n=6)
        for x in (-.96,.96):
            for y in (-.54,.54):
                m.rod("knee brace","timber",(x*1.45,y,.148),(x*.68,y,.464),.066,n=5)
    return m

def outcrop(rough):
    m=Model(rough)
    for i,(x,y,r,h,material) in enumerate([(-.18,.054,.62,.927,"stone"),(.453,.082,.417,.666,"slate"),(-.49,-.205,.297,.277,"limestone"),(.246,-.308,.245,.225,"stone")]):
        m.rings("fractured stone",material,[(x,y,0,r*.88,r*.74),(x-.021,y,h*.27,r,r*.82),(x+.05,y+.014,h*.71,r*.86,r*.63),(x+.07,y+.036,h,r*.49,r*.35)],6+i%2,.21+i)
    if not rough:
        for x,y,s in [(-.37,.12,.15),(.52,-.10,.12),(.05,-.42,.087)]:
            m.oval("moss patch","moss",(x,y,.083),(s,s*.77,.041),6)
        for x,y,s in [(-.71,-.315,.082),(.637,-.225,.092)]:
            m.rings("loose scree","slate",[(x,y,0,s,s*.76),(x+.008,y,s*.74,s*.71,s*.56)],6)
    return m

def lookout(rough):
    m=Model(rough)
    for x in (-.667,.667):
        for y in (-.525,.525):
            m.box("stone footing","stone",(x,y,.109),(.264,.251,.218))
            m.rod("tower stilt","wood",(x,y,.16),(x*.83,y*.83,2.07),.091,.074)
            m.rod("canopy pillar","timber",(x*.83,y*.83,1.98),(x*.83,y*.83,2.92),.057,n=6)
    for s in (-1,1):
        for a,b in [(-1,1),(1,-1)]:
            m.rod("frame brace","timber",(a*.641,s*.51,.289),(b*.565,s*.472,1.77),.055,n=5)
    m.box("watch platform","wood",(0,0,1.926),(1.64,1.34,.182))
    m.rings("canopy roof","tile",[(0,0,2.881,1.24,1.034),(0,0,2.955,1.255,1.055),(0,0,3.337,.369,.279)],4,math.pi/4)
    for y in (-.539,.539):
        m.box("balustrade","wood_light",(0,y,2.357),(1.44,.089,.095))
    for x in (-.681,.681):
        m.box("balustrade","wood_light",(x,0,2.357),(.09,1.09,.095))
    if not rough:
        for s in (-1,1):
            m.rod("underdeck cross brace","wood",(s*.649,-.514,.31),(s*.578,.46,1.787),.063,n=5)
        for x in (-.455,-.179,.177,.457):
            for y in (-.528,.528):
                m.rod("rail baluster","timber",(x,y,2.016),(x,y,2.319),.035,n=4)
        for x in (-.234,.234):
            m.rod("ladder rail","wood_light",(x,-.91,.014),(x,-.677,1.954),.04,n=6)
        for i in range(7):
            t=(i+.65)/7.6
            m.rod("ladder rung","wood",(-.234,-.91+.233*t,.018+1.91*t),(.234,-.91+.233*t,.018+1.91*t),.035,n=6)
        m.rings("roof collar","tile_glaze",[(0,0,3.328,.331,.265),(0,0,3.416,.165,.132)],4,math.pi/4)
    m.rod("signal mast","timber",(0,0,3.31),(0,0,3.82),.028,n=6)
    m.panel("signal pennant","faction_cloth",[(0,3.789),(.491,3.721),(.314,3.624),(.519,3.551),(0,3.58)],-.015,.026)
    return m

CATALOG=[
    ("hero-sword","行旅剑士","角色",lambda rough: figure("sword",rough)),
    ("hero-guard","执盾护卫","角色",lambda rough: figure("guard",rough)),
    ("hero-bow","山林弓手","角色",lambda rough: figure("bow",rough)),
    ("hero-priest","提灯牧师","角色",lambda rough: figure("priest",rough)),
    ("house","山乡民居","建筑",village),("tree","山脊青松","植被",pine),
    ("bridge","溪口木桥","建筑",crossing),("rock","溪畔石簇","地貌",outcrop),
    ("watchtower","巡山望楼","建筑",lookout),
]

def make_materials():
    for name in PALETTE:
        mat=bpy.data.materials.new(name)
        mat.use_nodes=True
        rgba=color(name)
        mat.diffuse_color=rgba
        shader=mat.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value=rgba
        shader.inputs["Metallic"].default_value=.48 if name in METALS else 0.
        shader.inputs["Roughness"].default_value=.45 if name in METALS else .87

def add_to_scene(asset_id, stage, model, location):
    collection=bpy.data.collections.new(f"{stage} · {asset_id}")
    bpy.context.scene.collection.children.link(collection)
    root=bpy.data.objects.new(f"{asset_id} | {stage}",None)
    collection.objects.link(root)
    root.empty_display_size=.16
    root["atelier_asset"]=asset_id
    root["atelier_stage"]=stage
    root.location=location
    groups={"body":root}
    for key,pivot in model.pivots.items():
        if key=="body": continue
        joint=bpy.data.objects.new(key,None)
        collection.objects.link(joint)
        joint.empty_display_size=.075
        joint.parent=root
        joint.location=pivot
        joint["atelier_joint"]=key
        groups[key]=joint
    for part in model.parts:
        center=sum(part.vertices,Vector((0,0,0))) / len(part.vertices)
        mesh=bpy.data.meshes.new(part.name)
        mesh.from_pydata([point-center for point in part.vertices],[],part.faces)
        mesh.materials.append(bpy.data.materials[part.mat])
        mesh.update()
        obj=bpy.data.objects.new(part.name,mesh)
        collection.objects.link(obj)
        obj.parent=groups[part.group]
        obj.location=center-model.pivots[part.group]
    bpy.context.view_layer.update()

def read_authored_mesh(root):
    """Read evaluated geometry below this asset. Respect manual edits and modifiers."""
    model=Model()
    graph=bpy.context.evaluated_depsgraph_get()
    to_local=root.matrix_world.inverted()
    def visit(obj, group):
        if "atelier_joint" in obj:
            group=obj["atelier_joint"]
            model.pivots[group]=to_local @ obj.matrix_world.translation
        if obj.type in {"MESH","CURVE","FONT","SURFACE","META"} and not obj.hide_render:
            evaluated=obj.evaluated_get(graph)
            mesh=evaluated.to_mesh()
            try:
                mesh.calc_loop_triangles()
                transform=to_local @ evaluated.matrix_world
                reflected=transform.to_3x3().determinant()<0
                vertices=[transform @ v.co for v in mesh.vertices]
                faces=defaultdict(list)
                for tri in mesh.loop_triangles:
                    idx=tri.material_index
                    mat=evaluated.material_slots[idx].material if idx<len(evaluated.material_slots) else None
                    indices=tuple(tri.vertices)
                    faces[mat.name if mat else "blockout"].append(tuple(reversed(indices)) if reflected else indices)
                for mat,tris in faces.items():
                    model.parts.append(Part(obj.name,mat,vertices,tris,group))
            finally:
                evaluated.to_mesh_clear()
        for child in obj.children: visit(child,group)
    visit(root,"body")
    if not model.parts: raise ValueError(f"No exportable meshes below {root.name}")
    return model

def material_data(name):
    mat=bpy.data.materials.get(name)
    rgba,metal,rough=[.48,.48,.48,1.],0.,.85
    if mat:
        rgba,metal,rough=list(mat.diffuse_color),mat.metallic,mat.roughness
        if mat.use_nodes:
            shader=next((node for node in mat.node_tree.nodes if node.type=="BSDF_PRINCIPLED"),None)
            if shader:
                rgba=list(shader.inputs["Base Color"].default_value)
                metal=shader.inputs["Metallic"].default_value
                rough=shader.inputs["Roughness"].default_value
    return {"name":name,"pbrMetallicRoughness":{"baseColorFactor":rgba,"metallicFactor":metal,"roughnessFactor":rough}}

def yup(v):
    return (v.x,v.z,-v.y)

def authoring_app():
    return Path(bpy.app.binary_path).stem or "Blender bpy"

def write_glb(model, path, asset_id):
    """Batch geometry by material, retaining independent shoulder pivots for the game."""
    mat_names=sorted({p.mat for p in model.parts})
    blob=bytearray()
    doc={"asset":{"version":"2.0","generator":f"Shanhe Field Kit / {authoring_app()} {bpy.app.version_string}"},
         "scene":0,"scenes":[{"name":asset_id,"nodes":[]}],"nodes":[],"meshes":[],
         "materials":[material_data(name) for name in mat_names],"buffers":[],
         "bufferViews":[],"accessors":[]}
    def accessor(data,fmt,components,type_name,usage,limits=False):
        while len(blob)%4: blob.append(0)
        start=len(blob)
        pack=struct.Struct("<"+fmt*components).pack
        for row in data: blob.extend(pack(*row))
        view=len(doc["bufferViews"])
        doc["bufferViews"].append({"buffer":0,"byteOffset":start,"byteLength":len(blob)-start,"target":usage})
        obj={"bufferView":view,"componentType":{"f":5126,"H":5123,"I":5125}[fmt],"count":len(data),"type":type_name}
        if limits:
            obj["min"]=[min(row[i] for row in data) for i in range(components)]
            obj["max"]=[max(row[i] for row in data) for i in range(components)]
        doc["accessors"].append(obj)
        return len(doc["accessors"])-1
    total=0
    groups=defaultdict(lambda:defaultdict(list))
    for part in model.parts: groups[part.group][part.mat].append(part)
    for group,materials in sorted(groups.items()):
        primitives=[]
        pivot=model.pivots[group]
        for mat,parts in sorted(materials.items()):
            coords,normals,indices,lookup=[],[],[],{}
            for part in parts:
                for face in part.faces:
                    a,b,c=(part.vertices[i] for i in face)
                    normal=(b-a).cross(c-a)
                    if normal.length_squared < 1e-18: continue
                    normal=tuple(round(n,6) for n in yup(normal.normalized()))
                    for v in (a,b,c):
                        pos=tuple(round(n,7) for n in yup(v-pivot))
                        key=(pos,normal)
                        if key not in lookup:
                            lookup[key]=len(coords)
                            coords.append(pos)
                            normals.append(normal)
                        indices.append((lookup[key],))
            if not indices: continue
            total+=len(indices)//3
            primitives.append({"attributes":{"POSITION":accessor(coords,"f",3,"VEC3",34962,True),
                                                "NORMAL":accessor(normals,"f",3,"VEC3",34962)},
                               "indices":accessor(indices,"H" if len(coords)<65536 else "I",1,"SCALAR",34963),
                               "material":mat_names.index(mat)})
        if not primitives: continue
        doc["nodes"].append({"name":group,"mesh":len(doc["meshes"]),"translation":yup(pivot)})
        doc["meshes"].append({"name":asset_id+"_"+group,"primitives":primitives})
        doc["scenes"][0]["nodes"].append(len(doc["nodes"])-1)
    while len(blob)%4: blob.append(0)
    doc["buffers"]=[{"byteLength":len(blob)}]
    header=json.dumps(doc,ensure_ascii=False,separators=(",",":")).encode()
    header+=b" "*((-len(header))%4)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(struct.pack("<4sII",b"glTF",2,28+len(header)+len(blob))+struct.pack("<I4s",len(header),b"JSON")+header
                     +struct.pack("<I4s",len(blob),b"BIN\0")+blob)
    lo,hi=model.bounds()
    return total,mat_names,[round(hi[i]-lo[i],4) for i in (0,2,1)]

def build(options):
    out=options.out.resolve()
    source=out/"source"
    source.mkdir(parents=True,exist_ok=True)
    project=source/"field-kit.blend"
    native_project=source/"field-kit.mixar"
    manifest_path=out/"manifest.json"
    if options.asset and not options.export_existing:
        raise ValueError("--asset requires --export-existing to keep the rest of the editable project.")
    if options.export_existing:
        if not any("atelier_asset" in o for o in bpy.context.scene.objects):
            bpy.ops.wm.open_mainfile(filepath=str(native_project if native_project.exists() else project))
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        make_materials()
        for i,(asset_id,_,_,create) in enumerate(CATALOG):
            for stage in ("final","blockout"):
                rough=stage=="blockout"
                x=(i%3-1)*4.5+(15 if rough else 0)
                y=(1-i//3)*4.7
                add_to_scene(asset_id,stage,create(rough),(x,y,0))
        bpy.context.scene.unit_settings.system="METRIC"
        bpy.context.scene["atelier_notes"]="Final at X=0, blockout at X=15. Edit children under the asset root; use --export-existing --asset ID."
        from mathutils import Euler
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type=="VIEW_3D":
                    view=area.spaces.active
                    view.shading.color_type="MATERIAL"
                    view.overlay.show_floor=False
                    view.overlay.show_axis_x=False
                    view.overlay.show_axis_y=False
                    view.overlay.show_extras=False
                    view.region_3d.view_distance=17
                    view.region_3d.view_location=(0,0,.9)
                    view.region_3d.view_rotation=Euler((math.radians(55),0,math.radians(-16))).to_quaternion()
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=str(project),compress=True)
        if authoring_app().lower()=="mixar":
            bpy.ops.wm.save_as_mainfile(filepath=str(native_project),copy=True,compress=True)
    roots={(o["atelier_asset"],o["atelier_stage"]):o for o in bpy.context.scene.objects if "atelier_asset" in o and "atelier_stage" in o}
    prior={}
    if options.asset:
        if not manifest_path.exists():
            raise FileNotFoundError("Run a full export once to initialize the asset manifest.")
        prior={item["id"]:item for item in json.loads(manifest_path.read_text())["assets"]}
    updated=[]
    for asset_id,label,category,_ in CATALOG:
        if options.asset and options.asset!=asset_id: continue
        finished=read_authored_mesh(roots[asset_id,"final"])
        grey=read_authored_mesh(roots[asset_id,"blockout"])
        tris,mats,size=write_glb(finished,out/"models"/(asset_id+".glb"),asset_id)
        rough_tris,_,_=write_glb(grey,out/"blockout"/(asset_id+".glb"),asset_id)
        prior[asset_id]={"id":asset_id,"label":label,"category":category,
            "model":f"/atelier/models/{asset_id}.glb","blockout":f"/atelier/blockout/{asset_id}.glb",
            "triangles":tris,"blockoutTriangles":rough_tris,"materials":mats,"size":size}
        updated.append(asset_id)
    payload={"version":"1.0.0","source":"/atelier/source/field-kit.blend","script":"/atelier/source/build_field_kit.py",
             "authoring":{"application":authoring_app(),"version":bpy.app.version_string,"exporter":"Shanhe Field Kit / glTF 2.0","sceneEngine":bpy.context.scene.render.engine},
             "axes":"glTF Y up, +Z front. Dimensions [width, height, depth] in metres.",
             "assets":[prior[k] for k,_,_,_ in CATALOG]}
    if native_project.exists(): payload["nativeSource"]="/atelier/source/field-kit.mixar"
    manifest_path.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    script=Path(__file__).resolve()
    if script != (source/script.name).resolve(): shutil.copyfile(script,source/script.name)
    print(json.dumps({"updated":updated,"manifest":str(manifest_path),"engine":bpy.app.version_string},ensure_ascii=False))

if __name__=="__main__":
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else sys.argv[1:]
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out",type=Path,default=Path("public/atelier"))
    parser.add_argument("--export-existing",action="store_true",help="Export edited objects from the open or output project")
    parser.add_argument("--asset",choices=[row[0] for row in CATALOG],help="Update this asset and its manifest entry")
    build(parser.parse_args(args))
