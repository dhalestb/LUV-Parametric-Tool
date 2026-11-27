import type {InsertedPlateReport} from './amphitheaterInteractiveTypes';

// Coordinates follow the 1000-unit right column used by the Linear Edge footer.
export function plateJunctionSvg(report:InsertedPlateReport){
  const floor=report.floors.find(f=>report.walls.some(w=>w.contacts.some(c=>c.floor===f.id&&c.volume>0)));
  if(!floor)return;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="425" viewBox="0 0 1000 425">
    <g font-family="Arial, sans-serif">
      <text x="405" y="32" font-size="31" fill="#71beda">HORIZONTAL PLATE JUNCTION</text>
      <g transform="translate(74 0) scale(.85)">
        <!-- Far wall, shown in section with its inside face exposed. -->
        <path fill="#c4c2c0" d="M18 61 L155 10 L172 18 L35 69 Z"/>
        <path fill="#aaa8a6" d="M18 61 L35 69 L35 265 L18 257 Z"/>
        <path fill="#dedcdb" d="M35 69 L172 18 L172 214 L35 265 Z"/>
        <!-- In wall-parallel coordinates the L and plank each span 137 units.
             The upright ends at x=18, where the near-left plank edge begins. -->
        <g transform="matrix(1 -.372263 0 1 99 212)">
          <path fill="#71beda" d="M-64 -71.64 H73 L155 -2 H18 Z"/>
          <path fill="#3e7286" d="M-64 -71.64 L18 -2 V12 L-64 -57.64 Z"/>
          <path fill="#518da3" d="M18 -2 H155 V12 H18 Z"/>
          <path fill="#907139" d="M0 -76 L-9 -83.64 V23.36 L0 31 Z"/>
          <path fill="#f0cc73" d="M0 -76 L-9 -83.64 H9 L18 -76 Z"/>
          <path fill="#d6ad4f" d="M0 -76 H18 V12 H137 V31 H0 Z"/>
        </g>
      </g>
      <g fill="#f7f6f5">
        <text x="405" y="94" font-size="26">The inner letter edge sets the plate</text>
        <text x="405" y="138" font-size="26">elevation. The plate extends to the</text>
        <text x="405" y="182" font-size="26">inside face of the perimeter wall.</text>
      </g>
    </g>
  </svg>`;
}
