'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { buildDigitalTwinPrompt } = require('../lib/prompt-builder');

const repoRoot = path.join(__dirname, '..');
const personaId = process.argv.includes('--persona')
  ? process.argv[process.argv.indexOf('--persona') + 1]
  : (process.env.PERSONA_ID || 'alisa-kujo');

const dataDir = process.env.DATA_DIR || path.join(require('os').homedir(), 'digital_ark_data');
const modelName = process.env.PERSONA_OLLAMA_MODEL || `digital-ark-${personaId}`;
const baseModel = process.env.OLLAMA_BASE_MODEL || 'qwen2.5:7b';

const mergeManifestPath = path.join(dataDir, 'finetune', 'merged', personaId, 'merge_manifest.json');
let fromLine = `FROM ${baseModel}`;
if (fs.existsSync(mergeManifestPath)) {
  const mm = JSON.parse(fs.readFileSync(mergeManifestPath, 'utf8'));
  if (mm.gguf_path && fs.existsSync(mm.gguf_path)) {
    fromLine = `FROM ${mm.gguf_path}`;
    console.log('[ollama] 使用 merged GGUF:', mm.gguf_path);
  } else if (mm.merged_dir) {
    console.log('[ollama] merged HF 在', mm.merged_dir, '（无 GGUF 时回退基座+SYSTEM）');
  }
}

const bundlePaths = [
  path.join(dataDir, 'persona', 'review', `${personaId}.json`),
  path.join(repoRoot, 'config', 'personas', `${personaId}.json`)
];
const bundlePath = bundlePaths.find(p => fs.existsSync(p));
if (!bundlePath) {
  console.error('[ollama] 找不到 persona bundle:', personaId);
  process.exit(1);
}
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));

const systemPrompt = buildDigitalTwinPrompt({
  mode: 'training',
  padDesc: '平静',
  personaProfile: bundle,
  traitSummary: {
    core_traits: bundle.meta?.core_traits,
    speech_patterns: bundle.voice?.speech_patterns,
    verbal_tics: bundle.voice?.verbal_tics,
    cognition: bundle.cognition,
    emotion_style: bundle.emotion
  },
  displayName: bundle.display_name,
  traineeName: bundle.trainee_label
});

const modelfileDir = path.join(dataDir, 'finetune');
fs.mkdirSync(modelfileDir, { recursive: true });
const modelfilePath = path.join(modelfileDir, `${personaId}.Modelfile`);

const safeSystem = systemPrompt.replace(/"""/g, "'''");

const modelfile = `${fromLine}

PARAMETER temperature 0.75
PARAMETER top_p 0.9
PARAMETER num_ctx 8192

SYSTEM """
${safeSystem}
"""
`;

fs.writeFileSync(modelfilePath, modelfile, 'utf8');
console.log('[ollama] Modelfile:', modelfilePath);

try {
  execSync(`ollama create ${modelName} -f "${modelfilePath}"`, { stdio: 'inherit' });
  console.log(`\n[ollama] 模型已创建: ${modelName}`);
  console.log(`请在 .env 中设置: PERSONA_MODEL=${modelName}`);
} catch (e) {
  console.error('[ollama] create 失败，请确认 ollama 已安装并在 PATH 中');
  console.error('可手动运行: ollama create', modelName, '-f', modelfilePath);
  process.exit(1);
}
