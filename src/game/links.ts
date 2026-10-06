/**
 * Public web pages and legal links of the app (one place for the paywall, settings and the store
 * listings). The site is `docs/site/`, published to `DanielArpadfalvi/craterpult-site` (GitHub
 * Pages) with `scripts/publish-site.sh` – see `docs/RELEASE.md`.
 */

const SITE = 'https://danielarpadfalvi.github.io/craterpult-site';

export const PRIVACY_URL = `${SITE}/privacy.html`;
export const SUPPORT_URL = `${SITE}/support.html`;
/** Online invite landing page (`?code=ABCDEF` opens `craterpult://join/ABCDEF`). */
export const joinUrl = (code: string): string =>
  `${SITE}/join.html?code=${encodeURIComponent(code)}`;
/** Terms of use: Apple's standard licensed application EULA (used on both stores for 1.0). */
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
