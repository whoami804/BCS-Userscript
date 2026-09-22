import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const basePath = 'control-suite-boosteroid-beta.user.js';
const outPath = 'control-suite-boosteroid-s0-safari-rc1.user.js';
const validationPath = 'validations/control-suite-v0.9.0-s0-safari-rc1-public-static.json';
const expectedPublicBaseSha256 = '42d7cbe4749994f35505e37a3304901f668d9bdf2a4c10374e94b926c2c08a7f';
const expectedEngineeringBaseSha256 = '413af8945e5653a72ceac9f0083efb1b51cb525953e2ba6c39fc64723ea2c675';
const expectedEngineeringCandidateSha256 = '31cdd13ec46f62a122d023771444ed7686a48ed474eb633b0764ceb656c1fef1';
const branch = 'feat/s0-safari-runtime-isolation';
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

replaceExact('metadata-version', '// @version      0.9.0-rc1', '// @version      0.9.0-s0-safari-rc1');
replaceExact(
  'metadata-description',
  '// @description  Product Experience candidate: movable native-style UI + automatic persistent stream profile on the RC19 gameplay foundation.',
  '// @description  S0 Safari runtime-isolation candidate on the v0.9.0-rc1 product foundation.'
);
replaceExact(
  'metadata-update-url',
  '// @updateURL    https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js',
  `// @updateURL    ${candidateRaw}`
);
replaceExact(
  'metadata-download-url',
  '// @downloadURL  https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js',
  `// @downloadURL  ${candidateRaw}`
);
replaceExact('runtime-version', "const VERSION = '0.9.0-rc1';", "const VERSION = '0.9.0-s0-safari-rc1';");
replaceExact(
  'runtime-build',
  "const BUILD = 'Product Experience UI + Auto-Persist Stream Profile + RC19 Gameplay Foundation - RC1';",
  "const BUILD = 'Safari Runtime Isolation - S0 RC1 on v0.9.0-rc1 Foundation';"
);

const oldImmUi = "  const imm=$('bcs-immersive-toggle');if(imm){imm.disabled=S.immersive.entering||S.immersive.exiting||!IS_STREAM_DOCUMENT;imm.textContent=S.immersive.active?'SAIR DO IMERSIVO':'ATIVAR IMERSIVO';}\n  const retry=$('bcs-immersive-retry');if(retry)retry.style.display=S.immersive.active?'block':'none';";
const newImmUi = "  const immersiveSupported=!!CAP.display.fullscreen;\n  const imm=$('bcs-immersive-toggle');if(imm){imm.disabled=S.immersive.entering||S.immersive.exiting||!IS_STREAM_DOCUMENT||!immersiveSupported;imm.textContent=S.immersive.active?'SAIR DO IMERSIVO':'ATIVAR IMERSIVO';}\n  setText('bcs-immersive-desc',immersiveSupported?'Abre o jogo em tela cheia.':'Não disponível neste navegador.');\n  const retry=$('bcs-immersive-retry');if(retry)retry.style.display=S.immersive.active&&immersiveSupported?'block':'none';";
replaceExact('immersive-capability-ui', oldImmUi, newImmUi);
replaceExact(
  'immersive-description-id',
  '<div class="bcs-label">Immersive</div><div class="bcs-desc">Abre o jogo em tela cheia.</div>',
  '<div class="bcs-label">Immersive</div><div id="bcs-immersive-desc" class="bcs-desc">Abre o jogo em tela cheia.</div>'
);

const oldBoot = `function boot() {
  installMouseMotionSchedulingFixPage();
  if (shouldAutoEnableMouseMotionSchedulingFix() && mouseSmoothnessPreference()) setMouseMotionSchedulingFixEnabled(true,'AUTO_INTEGRATED_LAB_B');
  installMouseChordFixPage();
  if (shouldAutoEnableMouseChordFix()) setMouseChordFixEnabled(true,'AUTO_INTEGRATED_LAB_B');
  installPageBridge();`;
const newBoot = `function boot() {
  // S0 Safari Runtime Isolation: LAB-B-only patches are not even installed outside validated LAB-B Chromium.
  if (shouldAutoEnableMouseMotionSchedulingFix()) {
    installMouseMotionSchedulingFixPage();
    if (mouseSmoothnessPreference()) setMouseMotionSchedulingFixEnabled(true,'AUTO_INTEGRATED_LAB_B');
  }
  if (shouldAutoEnableMouseChordFix()) {
    installMouseChordFixPage();
    setMouseChordFixEnabled(true,'AUTO_INTEGRATED_LAB_B');
  }
  installPageBridge();`;
replaceExact('lab-b-only-install-gate', oldBoot, newBoot);

const normalizedCandidateSha = sha256(stripDistributionMetadata(source));
if (normalizedCandidateSha !== expectedEngineeringCandidateSha256) {
  throw new Error(`NORMALIZED_CANDIDATE_SHA_MISMATCH expected=${expectedEngineeringCandidateSha256} actual=${normalizedCandidateSha}`);
}

fs.mkdirSync('validations', { recursive: true });
fs.writeFileSync(outPath, source);
const check = spawnSync(process.execPath, ['--check', outPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`NODE_CHECK_FAILED\n${check.stderr}`);

const validation = {
  artifact: outPath,
  version: '0.9.0-s0-safari-rc1',
  status: 'STATIC_PASS_PUBLIC_LAB_A_LIVE_READY',
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
  distributionOnlyDifferenceFromEngineeringCandidate: true
};
fs.writeFileSync(validationPath, JSON.stringify(validation, null, 2) + '\n');
console.log(JSON.stringify(validation, null, 2));
