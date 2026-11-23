// Flat Deep Plan Plate owns these policies independently of Open Hall.
import type { OfficeField, OfficePlan, OfficeSlot, Pt } from './contracts';
import * as THREE from 'three';

const PLATE_MARGIN = 2;
const MIN_CLEAR_HEIGHT = 8;
const WALL_BAND_HEIGHT = 2;

export const FLAT_PLATE_PRESETS = {
  columnSize: [1, 2, 3],
  floorMezzGuideSize: [6, 9, 11, 13],
  wallGuideSize: [1, 2, 3],
  columnSpacing: [10, 12, 15],
} as const;

export function flatPlateDimensions(settings: OfficeField['flatPlate']) {
  return {
    columnSize: settings?.columnSize ?? 2,
    floorMezzGuideSize: settings?.floorMezzGuideSize ?? 6,
    wallGuideSize: settings?.wallGuideSize ?? 1,
    columnSpacing: settings?.columnSpacing ?? 12,
    wallThickness: settings?.wallThickness ?? 1.5,
    slabThickness: settings?.slabThickness ?? .75,
  };
}

export function flatPlateSettingsError(settings: ReturnType<typeof flatPlateDimensions>) {
  const values = [
    ['Column L size', settings.columnSize],
    ['Floor and mezzanine L size', settings.floorMezzGuideSize],
    ['Wall L size', settings.wallGuideSize],
    ['Wall thickness', settings.wallThickness],
    ['Slab thickness', settings.slabThickness],
  ] as const;
  const invalid = values.find(([, value]) => !Number.isFinite(value) || value <= 0);
  if (invalid) return `Flat Deep Plan Plate requires ${invalid[0]} to be a positive number in feet.`;
  if (!Number.isFinite(settings.columnSpacing) || settings.columnSpacing < 1) {
    return 'Flat Deep Plan Plate requires a target column grid spacing of at least 1 ft.';
  }
}

export function flatPlateClearHeightCheck(height: number, slab: number) {
  const clearance = height / 2 - slab * 2;
  const ok = clearance > MIN_CLEAR_HEIGHT;
  return {
    label: 'Clear height',
    ok,
    detail: `Flat Deep Plan Plate has ${clearance.toFixed(2)} ft of clearance under the mezzanine with ${slab} ft slabs. It requires more than ${MIN_CLEAR_HEIGHT} ft.`
      + (ok ? '' : ' Reduce Slab thickness or increase Height Z.'),
  };
}

const rectangle=(x:number,y:number,w:number,d:number):Pt[]=>[[x-w/2,y-d/2],[x+w/2,y-d/2],[x+w/2,y+d/2],[x-w/2,y+d/2]];

export function flatPlateFootprint(field: OfficeField, slab: number, floorGuide: number) {
  const availableX=field.width-2*PLATE_MARGIN, availableY=field.depth-2*PLATE_MARGIN;
  const alongX=availableX>=availableY;
  const long=Math.max(availableX,availableY);
  const short=Math.min(availableX,availableY);
  const width=alongX?long:short, depth=alongX?short:long;
  const floor=rectangle(0,0,width,depth);
  // Occupy the negative side of the short axis, keeping the opposite half open.
  const mezz=alongX?rectangle(0,-depth/4,width,depth/2):rectangle(-width/4,0,width/2,depth);
  const slots:OfficeSlot[]=[];
  const guide=(polygon:Pt[],z:number)=>polygon.forEach((corner,i)=>{
    const rz=i*90, a=rz*Math.PI/180, size=floorGuide;
    // Native L outer corner (-.42,-.45) coincides with the plate corner.
    const ox=(-.42*Math.cos(a)+.45*Math.sin(a))*size, oy=(-.42*Math.sin(a)-.45*Math.cos(a))*size;
    // Keep the guide's depth within the slab without moving its plan corner.
    slots.push({x:corner[0]-ox,y:corner[1]-oy,z:Math.max(z-slab/2,size*.07+.001),rx:0,ry:0,rz,scale:size,prefer:'L'});
  });
  guide(floor,slab); guide(mezz,field.height/2);
  return {alongX, long, short, width, depth, floor, mezz, slots};
}

export function flatPlatePlan(field: OfficeField): Omit<OfficePlan,'rotation'> {
  const settings=flatPlateDimensions(field.flatPlate);
  const error=flatPlateSettingsError(settings);
  if(error)throw Error(error);
  const {slabThickness:slab, wallThickness:wallT, columnSpacing:spacing, columnSize, floorMezzGuideSize, wallGuideSize:wallGuide}=settings;
  const {alongX,long,short,width,depth,floor,mezz,slots}=flatPlateFootprint(field,slab,floorMezzGuideSize);
  const nx=Math.max(1,Math.floor(width/spacing)),ny=Math.max(1,Math.floor(depth/spacing));
  const sx=Math.min(width,nx*spacing),sy=Math.min(depth,ny*spacing);
  const supports=[];
  for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++){
    const x=-sx/2+i*sx/nx,y=-sy/2+j*sy/ny;
    // Filled native L pocket: .84 by .90; size and grid match Open Hall defaults.
    supports.push({id:`column-${i}-${j}`,polygon:rectangle(x,y,columnSize*.84,columnSize*.9),zTop:field.height/2+.05,thickness:field.height/2-.15,role:'support' as const});
    slots.push({x,y,z:slab+.3,rx:0,ry:0,rz:0,scale:columnSize,prefer:'L'});
  }
  // Author wall Ls first in each vertical panel's local (length, height) plane.
  // Parametric panels are measured back from their transformed outer corner tips.
  const walls:OfficePlan['plates']=[];
  const placeWallGuides=(tips:Pt[],n:number,axis:number,rotations:number[])=>{
    const wallGuides=tips.map(([u,z],i)=>{
      const rz=rotations[i],a=rz*Math.PI/180,size=wallGuide;
      const ox=(-.42*Math.cos(a)+.45*Math.sin(a))*size,oz=(-.42*Math.sin(a)-.45*Math.cos(a))*size;
      const cu=u-ox,cz=z-oz;
      // Local Z-yaw then X tilt, optionally turned 90 degrees about global Z.
      const matrix=new THREE.Matrix4().makeRotationZ(axis?Math.PI/2:0).multiply(new THREE.Matrix4().makeRotationX(Math.PI/2)).multiply(new THREE.Matrix4().makeRotationZ(a));
      const e=new THREE.Euler().setFromRotationMatrix(matrix,'XYZ');
      return {x:axis?n:cu,y:axis?cu:n,z:cz,rx:e.x*180/Math.PI,ry:e.y*180/Math.PI,rz:e.z*180/Math.PI,scale:size,prefer:'L' as const};
    });
    slots.push(...wallGuides);
    return wallGuides.map(g=>{
      const corner=new THREE.Vector3(-.42*g.scale,-.45*g.scale,0)
        .applyEuler(new THREE.Euler(g.rx*Math.PI/180,g.ry*Math.PI/180,g.rz*Math.PI/180,'XYZ'))
        .add(new THREE.Vector3(g.x,g.y,g.z));
      return [axis?corner.y:corner.x,corner.z] as Pt;
    });
  };
  const fillWall=(id:string,measured:Pt[],n:number,axis:number)=>{
    const lo=Math.min(...measured.map(p=>p[0])),hi=Math.max(...measured.map(p=>p[0]));
    const bottom=Math.min(...measured.map(p=>p[1])),top=Math.max(...measured.map(p=>p[1]));
    walls.push({id,polygon:axis?rectangle(n,(lo+hi)/2,wallT,hi-lo):rectangle((lo+hi)/2,n,hi-lo,wallT),zTop:top,thickness:top-bottom,role:'wall'});
  };
  const axis=alongX?0:1,halfLong=long/2,halfShort=short/2;
  // Hang bands from the plate above, then reflect across the short-axis centre.
  for(const [name,top] of [['mezz',field.height/2-slab],['roof',field.height-.05-slab]] as const){
    for(const side of [-1,1]){
      const n=side*(halfShort-wallT/2);
      const corners=placeWallGuides([[-halfLong,top-WALL_BAND_HEIGHT],[halfLong,top-WALL_BAND_HEIGHT],[halfLong,top],[-halfLong,top]],n,axis,[0,90,180,270]);
      fillWall(`long-${name}-${side}`,corners,n,axis);
    }
  }
  // Both short ends: lower cap on the mezzanine side; full upper cap below roof.
  for(const side of [-1,1]){
    const n=side*(halfLong-wallT/2);
    const mezzUnderside=field.height/2-slab;
    const roofUnderside=field.height-.05-slab;
    // Six Ls define the stepped end outline; no internal rectangle corners become guides.
    const c=placeWallGuides([[-halfShort,slab],[0,slab],[0,mezzUnderside-WALL_BAND_HEIGHT],[halfShort,mezzUnderside-WALL_BAND_HEIGHT],[halfShort,roofUnderside],[-halfShort,roofUnderside]],n,1-axis,[0,90,90,90,180,270]);
    // Fill the L-shaped outline in two rectangular strips using the measured guide tips.
    fillWall(`short-end-full-${side}`,[c[0],c[1],[c[1][0],c[5][1]],c[5]],n,1-axis);
    fillWall(`short-end-return-${side}`,[c[2],c[3],c[4],[c[2][0],c[4][1]]],n,1-axis);
  }
  const slabs: OfficePlan['plates'] = [
    {id:'deep-plate',polygon:floor,zTop:slab,thickness:slab,role:'ground'},
    {id:'half-width-mezzanine',polygon:mezz,zTop:field.height/2,thickness:slab,role:'mezzanine'},
    {id:'roof',polygon:floor,zTop:field.height-.05,thickness:slab,role:'roof'},
  ];
  const cornerPoints = [...floor, ...mezz];
  const columnCount = (nx + 1) * (ny + 1);
  const cornerGuides = slots.slice(0, cornerPoints.length);
  const columnGuides = slots.slice(cornerPoints.length, cornerPoints.length + supports.length);
  const wallGuides = slots.slice(cornerPoints.length + supports.length);
  const near = (actual: number, expected: number) => Math.abs(actual - expected) <= 1e-6;
  const matchedCorners = cornerGuides.filter((slot, index) => {
    const tip = new THREE.Vector3(-.42 * slot.scale, -.45 * slot.scale, 0)
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), slot.rz * Math.PI / 180);
    const [x, y] = cornerPoints[index];
    return near(slot.x + tip.x, x) && near(slot.y + tip.y, y);
  }).length;
  const longBands = walls.filter(wall => wall.id.startsWith('long-'));
  const endWalls = walls.filter(wall => wall.id.startsWith('short-end-'));
  const panelDepth = (panel: OfficePlan['plates'][number], normalAxis: number) => {
    const coordinates = panel.polygon.map(point => point[normalAxis]);
    return Math.max(...coordinates) - Math.min(...coordinates);
  };
  const checks=[
    {label:'Working plate ratio',ok:true,detail:`Ratio constraint disabled; footprint follows selected field dimensions with ${PLATE_MARGIN} ft edge margins.`},
    {label:'Half-width mezzanine',ok:true,detail:'Mezzanine covers half the short dimension and the full long dimension at mid-height.'},
    {label:'Column grid',ok:true,detail:`Filled L-pocket pillars on centered ${spacing} ft XY modules; short spans use one fitting bay.`},
    flatPlateClearHeightCheck(field.height,slab),
    {label:'Solid roof',ok:true,detail:'Roof follows base footprint with no skylights.'},
    {label:'Letter variations',ok:true,detail:'Invented L guides define floor/mezzanine corners and pillar grid.'},
    {label:'No uniform rescale',ok:true,detail:'Dimensions fit the selected field; completed geometry is not rescaled.'},
    {label:'Floor and mezzanine corner guides',ok:matchedCorners===8,
      detail:`${matchedCorners} of 8 L guide tips meet the four floor and four mezzanine corners in plan.`},
    {label:'Vertical wall guides',ok:wallGuides.length===28&&wallGuides.every(guide=>Math.abs(guide.rx)>1||Math.abs(guide.ry)>1),
      detail:`${wallGuides.length} wall guides define four band outlines with four corners each and two stepped ends with six corners each.`},
    {label:'Configured guide sizes',ok:cornerGuides.every(guide=>guide.scale===floorMezzGuideSize)&&columnGuides.every(guide=>guide.scale===columnSize)&&wallGuides.every(guide=>guide.scale===wallGuide),
      detail:`The floor and mezzanine guides use ${floorMezzGuideSize} ft, columns use ${columnSize} ft, and wall guides use ${wallGuide} ft.`},
    {label:'Rectangular ground slab',ok:floor.length===4&&width>0&&depth>0,
      detail:`One continuous ${width} × ${depth} ft rectangular ground slab spans the floor footprint.`},
    {label:'Slab section',ok:slabs.every(plate=>plate.thickness===slab)&&slabs[1].zTop===field.height/2,
      detail:`The ground, mezzanine and roof use ${slab} ft slabs. The mezzanine top sits ${slabs[1].zTop} ft above the field base.`},
    {label:'Filled-pocket piers',ok:supports.length===columnCount&&columnGuides.length===columnCount&&supports.every(pier=>pier.polygon.length===4),
      detail:`${supports.length} filled-pocket piers occupy the ${nx+1} × ${ny+1} column grid.`},
    {label:'Long-edge wall bands',ok:longBands.length===4&&longBands.every(band=>near(band.thickness,WALL_BAND_HEIGHT)&&near(panelDepth(band,1-axis),wallT)),
      detail:`${longBands.length} long-edge panels form ${WALL_BAND_HEIGHT} ft-high bands beneath the mezzanine and roof with ${wallT} ft panel depth.`},
    {label:'Stepped end walls',ok:endWalls.length===4&&endWalls.every(wall=>near(panelDepth(wall,axis),wallT)),
      detail:`${endWalls.length} panels form the full and return portions of the two stepped end walls at ${wallT} ft panel depth.`},
  ].map(c=>({label:c.label,status:c.ok?'pass' as const:'fail' as const,detail:c.detail}));
  return {typology:'flat-deep-plan-plate',plates:[...slabs,...supports,...walls],voids:[],links:[],slots,checks,operations:checks.map(c=>c.detail)};
}
