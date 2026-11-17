// Join same-level curved sweeps on the bisector of their face normals.
function joinCurvedNeighbors(w, blocks, parts, raw, floors) {
  const curves = blocks.filter(b => b.n.p.letter === 'U');
  const seams = [];
  const wall = (list, block) => list.find(p => p.id === 'boundary-' + block.n.id);
  for (const [i, a] of curves.entries()) {
    for (const b of curves.slice(i + 1)) {
      if (a.n.p.levelIndex !== b.n.p.levelIndex) continue;
      const first = wall(raw, a).solid, second = wall(raw, b).solid;
      const contact = first.intersect(second);
      if (contact.volume() <= 0.1) continue;
      const center = contact.boundingBox();
      const midpoint = a.direction.clone().fromArray(center.min).lerp(a.direction.clone().fromArray(center.max), 0.5);
      const toward = block => {
        const normal = block.direction.clone();
        if (normal.dot(midpoint.clone().sub(block.path[12])) < 0) normal.negate();
        return normal;
      };
      const normal = toward(a).sub(toward(b));
      if (normal.lengthSq() < 0.01) continue;
      normal.normalize();
      const offset = normal.dot(midpoint);
      const az = Math.atan2(normal.y, normal.x) * 180 / Math.PI;
      const tilt = Math.acos(normal.z) * 180 / Math.PI;
      const section = s => s.rotate([0, 0, -az]).rotate([0, -tilt, 0]).slice(offset);
      const area = section(contact).area();
      if (area < 0.1) continue;
      for (const [block, sign] of [[a,-1],[b,1]]) {
        const d = toward(block);
        const extension = wall(raw, block).solid.trimByPlane(d.toArray(),d.dot(block.path[12]) - 0.01)
          .trimByPlane(normal.clone().multiplyScalar(sign).toArray(),sign * offset - 0.01);
        const target = wall(parts, block);
        target.solid = target.solid.add(extension);
        const floor = floors.find(f => f.source === block.n.id);
        const midZ = (floor.bottomZ + floor.topZ) / 2;
        const slab = parts.find(p => p.id === floor.id);
        if (target.solid.intersect(slab.solid).volume() > 0.1) continue;
        const start = slab.solid.slice(midZ);
        // Extend to the closest patch of the actual wall at slab elevation.
        const outline = target.solid.slice(midZ);
        const options = outline.toPolygons().flatMap(loop => loop.map(point => {
          const patch = outline.intersect(w.CrossSection.square([1,1],true).translate(point));
          return {patch, plan:w.CrossSection.hull([start,patch])};
        })).filter(p => p.patch.area() > 0.2).sort((x,y) => x.plan.area()-y.plan.area());
        if (!options.length) throw Error('No curved wall landing at '+block.n.id);
        const plan = options[0].plan;
        slab.solid = plan.extrude(floor.thickness).translate([0,0,floor.bottomZ]);
        const bearing = target.solid.intersect(slab.solid).volume();
        if (bearing < 0.1) throw Error('Incomplete curved wall landing at '+block.n.id);
        floor.netArea = plan.area();
        floor.sourceContour = plan.toPolygons()[0];
        floor.curvedWallBearing = bearing;
      }
      const joint = wall(parts,a).solid.intersect(wall(parts,b).solid);
      const measured = section(joint).area();
      if (measured < area - 0.0001) throw Error('Curved joint lost contact during trimming');
      seams.push({source:a.n.id,receiver:b.n.id,sectionArea:measured,face:normal.toArray(),offset,kind:'curved miter'});
    }
  }
  return seams;
}
module.exports = {joinCurvedNeighbors};

