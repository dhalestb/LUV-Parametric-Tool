/** Geometry evidence inputs: callers must establish eligibility and route provenance. */
export type GatheringMeasurements = {area:number; width:number; clearHeight:number|null; openSky:boolean; independentApproaches:number; originsReachableArea:number; originsDisconnectedArea:number; originsUnknownArea:number};
export const GATHERING_CALIBRATION={areaReference:200,widthReference:12,heightReference:7,approachReference:4};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export function gatheringMetrics(m:GatheringMeasurements, calibration=GATHERING_CALIBRATION){
  const values=[m.area,m.width,m.independentApproaches,m.originsReachableArea,m.originsDisconnectedArea,m.originsUnknownArea,...Object.values(calibration)];
  if(values.some(v=>!Number.isFinite(v)||v<0)||Object.values(calibration).some(v=>v===0)||(!m.openSky&&(m.clearHeight===null||!Number.isFinite(m.clearHeight)||m.clearHeight<0)))throw new Error('Invalid or missing geometric measurement.');
  // Saturating geometric mean: neither excessive area nor extra height alone dominates.
  const suitability=Math.cbrt(clamp(m.area/calibration.areaReference)*clamp(m.width/calibration.widthReference)*(m.openSky?1:clamp(m.clearHeight!/calibration.heightReference)));
  const convergence=clamp(m.independentApproaches/calibration.approachReference);
  const total=m.originsReachableArea+m.originsDisconnectedArea+m.originsUnknownArea;
  const reachability=total?m.originsReachableArea/total:null;
  const reachabilityUpper=total?(m.originsReachableArea+m.originsUnknownArea)/total:null;
  const score=(r:number)=>100*(.4*suitability+.4*convergence+.2*r);
  return {suitability,convergence,reachability,reachabilityUpper,scoreLower:reachability===null?null:score(reachability),scoreUpper:reachabilityUpper===null?null:score(reachabilityUpper),definitive:total>0&&m.originsUnknownArea===0};
}
