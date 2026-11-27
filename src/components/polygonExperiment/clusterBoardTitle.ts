import {
  beginText, endText, PDFOperator, PDFOperatorNames, PDFString, type PDFPage,
  popGraphicsState, pushGraphicsState, setFillingRgbColor, setFontAndSize, setTextMatrix,
} from 'pdf-lib';
import {categoryByTypology, spaceCategories, type SpaceCategory} from './typologyCategories';
import type {Typology} from './model';

const labels: Record<SpaceCategory, string> = {
  'Gathering Spaces': 'GATHERING', 'Lobby Spaces': 'LOBBY', Workspaces: 'WORKSPACE', 'Hybrid Spaces': 'HYBRID',
};

export function clusterBoardTitle(clusters: {rows: {id: string; area: number}[]}[]) {
  const areas = new Map<SpaceCategory, number>();
  for (const {rows} of clusters) {
    for (const row of rows) {
      if (row.area <= 0) continue;
      const category = categoryByTypology[row.id as Typology];
      if (!category) throw Error('No space category is registered for ' + row.id + '.');
      areas.set(category, (areas.get(category) ?? 0) + row.area);
    }
  }
  // The existing category menu order breaks ties. Raw ft² weights differently sized zones correctly.
  const ranked = spaceCategories.filter(c => areas.has(c))
    .sort((a, b) => areas.get(b)! - areas.get(a)!);
  if (!ranked.length) return {template: 2, title: 'Site Cluster'};
  if (ranked.length === 1) {
    if (ranked[0] === 'Gathering Spaces') return {template: 0, title: 'Gathering Space Cluster'};
    if (ranked[0] === 'Lobby Spaces') return {template: 1, title: 'Lobby Space Cluster'};
  }
  return {template: 3, title: ranked.map(c => labels[c]).join(' | ') + ' TYPOLOGY'};
}

// Changeling Neo pair adjustments from the InDesign title specimen, in thousandths of an em.
const kerning: Record<string, number> = {WO: 15, PA: 128, AC: 30, CE: 10, GA: 30.1, AT: 184, LO: 20};
export function drawCategoryTitle(page: PDFPage, title: string) {
  function run(value: string) {
    const parts: (number | PDFString)[] = [];
    let start = 0;
    for (let i = 1; i < value.length; i++) {
      const adjustment = kerning[value.slice(i-1,i+1)];
      if (!adjustment) continue;
      parts.push(PDFString.of(value.slice(start,i)), adjustment);
      start = i;
    }
    parts.push(PDFString.of(value.slice(start)));
    return PDFOperator.of(PDFOperatorNames.ShowTextAdjusted,[page.doc.context.obj(parts)]);
  }
  const suffix = ' TYPOLOGY';
  page.pushOperators(pushGraphicsState(),beginText(),setFontAndSize('CategoryTitle',100),
    setTextMatrix(1,0,0,1,96.231,2011.9922),setFillingRgbColor(.839,.678,.31),
    run(title.slice(0,-suffix.length)),setFillingRgbColor(1,1,1),run(suffix),endText(),popGraphicsState());
}

