import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const basePath = 'control-suite-boosteroid-s0-safari-rc1.user.js';
const outPath = 'control-suite-boosteroid-s1-safari-clean-rc1.user.js';
const validationPath = 'validations/control-suite-v0.9.0-s1-safari-clean-surface-rc1-public-static.json';
const expectedPublicBaseSha256 = 'c19d8aed47ab97f2093425238b493331e7dfd0670b6e3d791c512450348f11af';
const expectedEngineeringBaseSha256 = '31cdd13ec46f62a122d023771444ed7686a48ed474eb633b0764ceb656c1fef1';
const expectedEngineeringCandidateSha256 = '9eb68882d76eddb31ba55b0baa5e96fbdb11f28fb215719c75aee203e114b631';
const branch = 'feat/s1-safari-clean-video-surface';
const candidateRaw = `https://raw.githubusercontent.com/whoami804/BCS-Userscript/${branch}/${outPath}`;

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const stripDistributionMetadata = text => text
  .split('\n')
  .filter(line => !/^\/\/ @(homepageURL|updateURL|downloadURL)\s/.test(line))
  .join('\n');

const base = fs.readFileSync(basePath, 'utf8');
const baseSha = sha256(base);
if (baseSha !== expectedPublicBaseSha256) throw new Error(`PUBLIC_BASE_SHA_MISMATCH expected=${expectedPublicBaseSha256} actual=${baseSha}`);
const normalizedBaseSha = sha256(stripDistributionMetadata(base));
if (normalizedBaseSha !== expectedEngineeringBaseSha256) throw new Error(`NORMALIZED_BASE_SHA_MISMATCH expected=${expectedEngineeringBaseSha256} actual=${normalizedBaseSha}`);

let source = base;
const changes = [];
function replaceExact(label, from, to, expectedCount = 1) {
  const count = source.split(from).length - 1;
  if (count !== expectedCount) throw new Error(`${label}: expected ${expectedCount} occurrence(s), found ${count}`);
  source = source.replace(from, to);
  changes.push(label);
}

replaceExact('metadata-version', '// @version      0.9.0-s0-safari-rc1', '// @version      0.9.0-s1-safari-clean-rc1');
replaceExact(
  'metadata-description',
  '// @description  S0 Safari runtime-isolation candidate on the v0.9.0-rc1 product foundation.',
  '// @description  S1 Safari clean-video-surface candidate: no BCS visual surface inside LAB-A stream documents.'
);
replaceExact(
  'metadata-update-url',
  '// @updateURL    https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s0-safari-runtime-isolation/control-suite-boosteroid-s0-safari-rc1.user.js',
  `// @updateURL    ${candidateRaw}`
);
replaceExact(
  'metadata-download-url',
  '// @downloadURL  https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s0-safari-runtime-isolation/control-suite-boosteroid-s0-safari-rc1.user.js',
  `// @downloadURL  ${candidateRaw}`
);
replaceExact('runtime-version', "const VERSION = '0.9.0-s0-safari-rc1';", "const VERSION = '0.9.0-s1-safari-clean-rc1';");
replaceExact(
  'runtime-build',
  "const BUILD = 'Safari Runtime Isolation - S0 RC1 on v0.9.0-rc1 Foundation';",
  "const BUILD = 'Safari Clean Video Surface - S1 RC1 on S0 Runtime Isolation';"
);
replaceExact(
  'retain-clean-surface-event',
  "  'H014D_FIX_ENABLED','H014D_FIX_ERROR','H014D_TARGET_SEEN','EXPORT'\n]);",
  "  'H014D_FIX_ENABLED','H014D_FIX_ERROR','H014D_TARGET_SEEN','SAFARI_CLEAN_VIDEO_SURFACE_ACTIVE','EXPORT'\n]);"
);

const oldWaitForBody = `function waitForBody() {
  if(document.body){createUI();bindGlobalSurfaceEvents();videoScanner();return;}
  setTimeout(waitForBody,50);
}`;
const newWaitForBody = `function shouldUseSafariCleanVideoSurface() {
  return IS_STREAM_DOCUMENT && inferLab() === 'LAB-A' && ENV.browser === 'Safari' && ENV.engine === 'WebKit';
}

function waitForBody() {
  if(document.body){
    if (shouldUseSafariCleanVideoSurface()) {
      // S1: zero BCS visual surface in LAB-A stream documents. The product
      // control/runtime continues in background; configure on the normal
      // Boosteroid page before PLAY. No launcher, panel, blur or overlay is
      // created in the stream document, keeping the video surface compositor-clean.
      S.ui.open=false;
      S.ui.built=false;
      addEvent('SAFARI_CLEAN_VIDEO_SURFACE_ACTIVE',{
        streamDocument:true,
        uiCreated:false,
        browser:ENV.browser,
        engine:ENV.engine,
        lab:inferLab()
      });
    } else {
      createUI();
    }
    bindGlobalSurfaceEvents();
    videoScanner();
    return;
  }
  setTimeout(waitForBody,50);
}`;
replaceExact('lab-a-clean-video-surface', oldWaitForBody, newWaitForBody);

const normalizedCandidateSha = sha256(stripDistributionMetadata(source));
if (normalizedCandidateSha !== expectedEngineeringCandidateSha256) {
  throw new Error(`NORMALIZED_CANDIDATE_SHA_MISMATCH expected=${expectedEngineeringCandidateSha256} actual=${normalizedCandidateSha}`);
}
if (!source.includes("return IS_STREAM_DOCUMENT && inferLab() === 'LAB-A' && ENV.browser === 'Safari' && ENV.engine === 'WebKit';")) {
  throw new Error('CLEAN_SURFACE_GATE_MISSING');
}

fs.mkdirSync('validations', { recursive: true });
fs.writeFileSync(outPath, source);
const check = spawnSync(process.execPath, ['--check', outPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`NODE_CHECK_FAILED\n${check.stderr}`);

const validation = {
  artifact: outPath,
  version: '0.9.0-s1-safari-clean-rc1',
  status: 'STATIC_PASS_PUBLIC_LAB_A_CLEAN_SURFACE_LIVE_READY',
  base: {
    publicSha256: baseSha,
    requiredPublicSha256: expectedPublicBaseSha256,
    normalizedEngineeringSha256: normalizedBaseSha,
    requiredEngineeringSha256: expectedEngineeringBaseSha256
  },
  candidate: {
    publicSha256: sha256(source),
    normalizedEngineeringSha256: normalizedCandidateSha,
    requiredEngineeringCandidateSha256: expectedEngineeringCandidateSha256,
    bytes: Buffer.byteLength(source),
    lines: source.split('\n').length,
    updateURL: candidateRaw,
    downloadURL: candidateRaw
  },
  nodeCheck: 'PASS',
  exactChanges: changes,
  experiment: {
    labAStreamUiCreation: false,
    visualSurfaceInLabAStream: 'NONE_CREATED_BY_BCS',
    normalBoosteroidPageUiCreation: true
  },
  distributionOnlyDifferenceFromEngineeringCandidate: true
};
fs.writeFileSync(validationPath, JSON.stringify(validation, null, 2) + '\n');
console.log(JSON.stringify(validation, null, 2));
