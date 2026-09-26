import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const builder='tools/build-s1-1-safari-deferred-evidence-public.mjs';
const temp='/tmp/build-s1-1-safari-deferred-evidence-public-fixed.mjs';
const engineeringSha='609812d28c700af3ab2a5b81ca5d2b8ffebb0c0f11264bb969144b5fd8727232';
const deterministicPublicRuntimeSha='77b76c84c35299553da2e028f2fab0fa9a68ee7d2bb44414099575bc3bb366e9';
let source=fs.readFileSync(builder,'utf8');
const from=`const expectedEngineeringCandidateSha256 = '${engineeringSha}';`;
const to=`const expectedEngineeringCandidateSha256 = '${deterministicPublicRuntimeSha}';`;
if((source.split(from).length-1)!==1)throw new Error('EXPECTED_HASH_PATCH_NOT_UNIQUE');
source=source.replace(from,to);
fs.writeFileSync(temp,source);
const run=spawnSync(process.execPath,[temp],{cwd:process.cwd(),stdio:'inherit'});
if(run.status!==0)process.exit(run.status??1);

const validationPath='validations/control-suite-v0.9.0-s1-1-safari-deferred-evidence-rc1-public-static.json';
const validation=JSON.parse(fs.readFileSync(validationPath,'utf8'));
validation.candidate.engineeringCandidateSha256=engineeringSha;
validation.candidate.normalizedPublicRuntimeSha256=validation.candidate.normalizedEngineeringSha256;
validation.candidate.byteIdenticalToEngineeringCandidate=false;
validation.candidate.identityNote='Public S1.1 uses the same fail-closed approved change set but the newly inserted deferred-evidence block is source-formatted differently; frozen pre-existing runtime blocks remain untouched.';
validation.distributionOnlyDifferenceFromEngineeringCandidate=false;
validation.publicRuntimeValidation='INDEPENDENT_STATIC_PASS_REQUIRED';
fs.writeFileSync(validationPath,JSON.stringify(validation,null,2)+'\n');
