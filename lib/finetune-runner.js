'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const STEPS = ['export', 'train', 'merge', 'ollama_create', 'activate'];

class FinetuneRunner {
  constructor({ dataDir, repoRoot, deps = {} }) {
    this.dataDir = dataDir;
    this.repoRoot = repoRoot || path.join(__dirname, '..');
    this.deps = deps;
    this.jobsDir = path.join(dataDir, 'finetune', 'jobs');
    fs.mkdirSync(this.jobsDir, { recursive: true });
  }

  _jobPath(id) {
    return path.join(this.jobsDir, `${id}.json`);
  }

  _save(job) {
    fs.writeFileSync(this._jobPath(job.id), JSON.stringify(job, null, 2));
  }

  getJob(id) {
    const p = this._jobPath(id);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  listJobs() {
    return fs.readdirSync(this.jobsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(this.jobsDir, f), 'utf8')))
      .sort((a, b) => (b.started_at || 0) - (a.started_at || 0));
  }

  _run(cmd, args, env = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: this.repoRoot,
        env: { ...process.env, DATA_DIR: this.dataDir, ...env },
        shell: process.platform === 'win32'
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', d => { stdout += d; });
      child.stderr?.on('data', d => { stderr += d; });
      child.on('close', code => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr || stdout || `exit ${code}`));
      });
      child.on('error', reject);
    });
  }

  async start(personaId = 'user') {
    const id = `ft_${Date.now()}`;
    const job = {
      id,
      persona_id: personaId,
      status: 'exporting',
      step: 'export',
      steps: STEPS.map(s => ({ name: s, status: 'pending' })),
      error: null,
      started_at: Date.now(),
      finished_at: null
    };
    this._save(job);

    try {
      job.steps[0].status = 'running';
      this._save(job);
      const { exportCorpus } = require(path.join(this.repoRoot, 'scripts', 'export-lora-corpus'));
      const { buildUserPersonaBundle, saveUserBundleReview } = require('./user-persona-bundle');
      if (personaId === 'user' && this.deps.setupStore && this.deps.personalMemory) {
        const bundle = buildUserPersonaBundle({
          dataDir: this.dataDir,
          setupStore: this.deps.setupStore,
          personalMemory: this.deps.personalMemory,
          relationshipStore: this.deps.relationshipStore,
          feedbackLearning: this.deps.feedbackLearning,
          trainingSystem: this.deps.trainingSystem
        });
        saveUserBundleReview(this.dataDir, bundle);
      }
      const exp = await exportCorpus({
        dataDir: this.dataDir,
        repoRoot: this.repoRoot,
        personaId,
        setupStore: this.deps.setupStore,
        personalMemory: this.deps.personalMemory,
        relationshipStore: this.deps.relationshipStore,
        feedbackLearning: this.deps.feedbackLearning,
        trainingSystem: this.deps.trainingSystem
      });
      if (exp.rows < 5) throw new Error(`语料过少 (${exp.rows} 条)，请继续训练后再微调`);
      job.steps[0].status = 'done';
      job.steps[0].detail = `${exp.rows} rows`;
      job.status = 'training';
      job.step = 'train';
      this._save(job);

      job.steps[1].status = 'running';
      this._save(job);
      await this._run('python', [path.join(this.repoRoot, 'scripts', 'train-lora.py'), '--persona', personaId]);
      job.steps[1].status = 'done';
      job.status = 'merging';
      job.step = 'merge';
      this._save(job);

      job.steps[2].status = 'running';
      this._save(job);
      try {
        await this._run('python', [path.join(this.repoRoot, 'scripts', 'merge-lora-ollama.py'), '--persona', personaId]);
        job.steps[2].status = 'done';
      } catch (e) {
        job.steps[2].status = 'skipped';
        job.steps[2].detail = e.message;
      }

      job.status = 'creating_ollama';
      job.step = 'ollama_create';
      job.steps[3].status = 'running';
      this._save(job);
      const modelName = process.env.PERSONA_OLLAMA_MODEL || `digital-ark-${personaId}`;
      await this._run('node', [path.join(this.repoRoot, 'scripts', 'create-ollama-model.js'), '--persona', personaId], {
        PERSONA_ID: personaId,
        PERSONA_OLLAMA_MODEL: modelName
      });
      job.steps[3].status = 'done';

      job.status = 'activating';
      job.step = 'activate';
      job.steps[4].status = 'running';
      this._save(job);
      const activePath = path.join(this.dataDir, 'active_chat_model.json');
      fs.writeFileSync(activePath, JSON.stringify({
        model: modelName,
        persona_id: personaId,
        job_id: id,
        weights_personalized: job.steps[2].status === 'done',
        updated_at: Date.now()
      }, null, 2));
      job.steps[4].status = 'done';
      job.status = 'done';
      job.finished_at = Date.now();
      job.active_model = modelName;
      this._save(job);
      return job;
    } catch (e) {
      job.status = 'failed';
      job.error = e.message;
      job.finished_at = Date.now();
      const idx = job.steps.findIndex(s => s.status === 'running');
      if (idx >= 0) job.steps[idx].status = 'failed';
      this._save(job);
      throw e;
    }
  }
}

function loadActiveChatModel(dataDir) {
  try {
    const p = path.join(dataDir, 'active_chat_model.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return null;
}

module.exports = { FinetuneRunner, loadActiveChatModel };
