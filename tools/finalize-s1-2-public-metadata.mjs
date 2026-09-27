import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const artifact='control-suite-boosteroid-s1-2-safari-lifecycle-rc1.user.js';
const validation='validations/control-suite-v0.9.1-s1-2-safari-lifecycle-public-static.json';
const oldUrl='https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s1-1-safari-deferred-evidence/control-suite-boosteroid-s1-1-safari-deferred-rc1.user.js';
const newUrl='https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s1-2-safari-lifecycle-harness/control-suite-boosteroid-s1-2-safari-lifecycle-rc1.user.js';
const sha256=t=>crypto.createHash('sha256').update(t).digest('hex');

let src=fs.readFileSync(artifact,'utf8');
const updateLine=`// @updateURL    ${newUrl}`;
const oldDownloadLine=`// @downloadURL  ${oldUrl}`;
const newDownloadLine=`// @downloadURL  ${newUrl}`;
if(!src.includes(updateLine))throw new Error('S1_2_UPDATE_URL_NOT_FINAL');
const count=src.split(oldDownloadLine).length-1;
if(count!==1)throw new Error(`EXPECTED_ONE_OLD_DOWNLOAD_URL found=${count}`);
src=src.replace(oldDownloadLine,newDownloadLine);
if(!src.includes(newDownloadLine))throw new Error('S1_2_DOWNLOAD_URL_NOT_FINAL');
if(src.includes(`// @updateURL    ${oldUrl}`)||src.includes(oldDownloadLine))throw new Error('STALE_S1_1_METADATA_URL_REMAINS');
fs.writeFileSync(artifact,src);
const check=spawnSync(process.execPath,['--check',artifact],{encoding:'utf8'});
if(check.status!==0)throw new Error(`NODE_CHECK_FAILED_AFTER_METADATA_FINALIZE\n${check.stderr}`);
const v=JSON.parse(fs.readFileSync(validation,'utf8'));
v.candidate={sha256:sha256(src),bytes:Buffer.byteLength(src),lines:src.split('\n').length};
v.exactChanges=[...new Set([...(v.exactChanges||[]),'metadata-download-url-finalizer'])];
v.metadataGate={status:'PASS',updateURL:newUrl,downloadURL:newUrl,staleS11URL:false};
fs.writeFileSync(validation,JSON.stringify(v,null,2)+'\n');
console.log(JSON.stringify({status:'PUBLIC_METADATA_GATE_PASS',sha256:sha256(src),updateURL:newUrl,downloadURL:newUrl},null,2));
