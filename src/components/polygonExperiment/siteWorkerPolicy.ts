/** The integration Preview uses Vercel Deployment Protection for generation. */
export function isSiteIntegrationPreview(environment?: string, branch?: string) {
  return environment === 'preview' && (branch === 'codex/two-tab-site-integration' || branch === 'codex/combined-generators-release');
}
