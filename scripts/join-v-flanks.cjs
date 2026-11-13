// Add a second wall from the unused exterior V flank to a distinct perimeter receiver.
function joinVFlanks(w, blocks, parts, raw, seams, clip, reach) {
  const wall = (list, id) => list.find(part => part.id === 'boundary-' + id);
  for (const v of blocks.filter(b => b.otherFlank)) {
    const neighbors = blocks.filter(b => b !== v && b.n.p.levelIndex === v.n.p.levelIndex);
    const established = neighbors.map(b => ({
      block: b, volume: wall(parts, b.n.id).solid.intersect(wall(parts, v.n.id).solid).volume(),
      sealed: seams.some(s => s.source === b.n.id && s.receiver === v.n.id)
    })).filter(hit => hit.volume > 0.1).sort((a,b) => Number(b.sealed)-Number(a.sealed) || b.volume-a.volume)[0];
    if (!established) continue;
    const {path, index} = v.otherFlank;
    const axis = v.direction;
    const across = path[1].clone().sub(path[0]).cross(axis).normalize();
    const corners = path.flatMap(p => [-0.36,0.36].map(t => p.clone().addScaledVector(across,t)));
    const hull = distances => w.Manifold.hull(corners.flatMap(p => distances.map(t => p.clone().addScaledVector(axis,t).toArray())));
    const candidates = [];
    for (const b of neighbors) {
      const side = established.block.face;
      if (b.face.axis === side.axis && b.face.sign === side.sign) continue;
      const receiver = wall(raw,b.n.id).solid;
      for (const sign of [-1,1]) {
        const overlap = hull([0,sign*reach]).intersect(clip).intersect(receiver);
        if (overlap.volume() <= 0.1) continue;
        const mesh = overlap.getMesh(), coordinates = mesh.vertProperties;
        let distance = Infinity;
        for (let i=0;i<coordinates.length;i+=mesh.numProp) {
          const p = path[0].clone().fromArray(coordinates,i);
          distance = Math.min(distance,sign*axis.dot(p.sub(path[0])));
        }
        candidates.push({b,overlap,distance});
      }
    }
    const best = candidates.sort((a,b) => a.distance-b.distance)[0];
    if (!best) continue;
    const panel = w.Manifold.hull([hull([-0.01,0.01]),best.overlap]).intersect(clip);
    const receiver = wall(parts,best.b.n.id);
    // Straight receiver walls are convex. Preserve the bend of a curved receiver.
    if (best.b.path.length === 2) receiver.solid = w.Manifold.hull([receiver.solid,best.overlap]).intersect(wall(raw,best.b.n.id).solid);
    const joint = receiver.solid.intersect(panel);
    if (joint.volume() <= 0.1) continue;
    const section = joint.slice((joint.boundingBox().max[2]+joint.boundingBox().min[2])/2);
    if (section.area() < 0.1) continue;
    parts.push({id:'flank-'+v.n.id,owner:v.n.id,solid:panel});
    const sideName = b => (b.face.sign>0?'+':'-')+'XY'[b.face.axis];
    seams.push({source:v.n.id,receiver:best.b.n.id,outerContour:index,receiverSide:sideName(best.b),
      existingReceiver:established.block.n.id,existingSide:sideName(established.block),
      sectionArea:section.area(),volume:joint.volume(),kind:'second exterior V flank'});
  }
}
module.exports = {joinVFlanks};

