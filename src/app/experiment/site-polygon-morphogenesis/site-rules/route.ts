import { executeSiteWorker } from '../worker';
export const runtime = 'nodejs';
export const maxDuration = 90;

export function POST(request: Request) {
  return executeSiteWorker(request, 'site-rules');
}
