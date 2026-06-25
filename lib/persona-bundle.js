'use strict';

const fs = require('fs');
const path = require('path');

class PersonaBundleManager {
  constructor(dataDir, repoRoot) {
    this.dataDir = dataDir;
    this.repoRoot = repoRoot || path.join(__dirname, '..');
    this.personaDir = path.join(dataDir, 'persona');
    this.manifestPath = path.join(this.personaDir, 'manifest.json');
    this.reviewDir = path.join(this.personaDir, 'review');
    if (!fs.existsSync(this.personaDir)) fs.mkdirSync(this.personaDir, { recursive: true });
    if (!fs.existsSync(this.reviewDir)) fs.mkdirSync(this.reviewDir, { recursive: true });
  }

  bundlePath(personaId) {
    return path.join(this.repoRoot, 'config', 'personas', `${personaId}.json`);
  }

  loadBundle(personaId) {
    const p = this.bundlePath(personaId);
    if (!fs.existsSync(p)) throw new Error(`Persona bundle not found: ${personaId}`);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  _loadManifest() {
    try {
      if (fs.existsSync(this.manifestPath)) return JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
    } catch {}
    return { ingested: {} };
  }

  _saveManifest(m) {
    fs.writeFileSync(this.manifestPath, JSON.stringify(m, null, 2));
  }

  copyForReview(personaId) {
    const bundle = this.loadBundle(personaId);
    const out = path.join(this.reviewDir, `${personaId}.json`);
    fs.writeFileSync(out, JSON.stringify(bundle, null, 2));
    return { path: out, bundle };
  }

  isIngested(personaId, version) {
    const m = this._loadManifest();
    return m.ingested[personaId]?.version === version;
  }

  /**
   * 将 persona 五维数据写入各子系统，供审查与对话使用
   */
  async ingest(personaId, deps) {
    const bundle = this.loadBundle(personaId);
    const {
      personalMemory,
      relationshipStore,
      trainingSystem,
      indexToRAG,
      personaProfile
    } = deps;

    const stats = {
      persona_id: personaId,
      version: bundle.version,
      memories: 0,
      relationships: 0,
      scenarios: 0,
      emotion: 0,
      cognition: 1,
      rag: 0,
      dialogue_samples: 0
    };

    const existingMem = new Set(
      (personalMemory.memories || []).filter(m => m.source === `persona:${personaId}`).map(m => m.content.slice(0, 40))
    );

    for (const mem of bundle.memories || []) {
      if (existingMem.has(String(mem.content).slice(0, 40))) continue;
      const pm = personalMemory.add({
        ...mem,
        source: `persona:${personaId}`
      });
      stats.memories++;
      if (indexToRAG) {
        await indexToRAG(pm.id, pm.content, {
          type: 'memory',
          tier: pm.tier,
          tags: pm.tags,
          persona: personaId
        });
        stats.rag++;
      }
    }

    for (const rel of bundle.relationships || []) {
      const person = relationshipStore.upsert({
        name: rel.name,
        type: rel.type === 'partner' ? 'spouse' : rel.type,
        notes: rel.notes,
        intimacy: { level: rel.intimacy_level || 3 }
      });
      stats.relationships++;

      for (const sc of rel.scenarios || []) {
        relationshipStore.completeScenario(
          person.id,
          rel.type,
          sc.scene,
          sc.response_text
        );
        stats.scenarios++;
        const ragText = `[关系·${rel.name}] ${sc.scene} → ${sc.response_text}（${sc.pattern}）`;
        if (indexToRAG) {
          await indexToRAG(`rel_${person.id}_${stats.scenarios}`, ragText, {
            type: 'relationship',
            person: rel.name,
            persona: personaId
          });
          stats.rag++;
        }
      }
    }

    if (bundle.emotion) {
      trainingSystem.processEmotionTraining(
        'persona_baseline',
        bundle.emotion.scenarios?.[0]?.response || '先陪伴，再分析',
        bundle.emotion.stress_response,
        bundle.emotion.comfort_style,
        `persona_${personaId}_emotion`
      );
      stats.emotion = (bundle.emotion.scenarios || []).length;
      for (const es of bundle.emotion.scenarios || []) {
        const t = `[情感] ${es.scenario} → ${es.response}`;
        if (indexToRAG) {
          await indexToRAG(`emo_${personaId}_${stats.emotion}`, t, { type: 'emotion', persona: personaId });
          stats.rag++;
        }
      }
    }

    if (bundle.cognition) {
      trainingSystem.processCognitionTraining(
        bundle.cognition.values_ranking,
        (bundle.cognition.conflict_choices || []).map(c => ({ choice: `${c.case}: ${c.choice}` })),
        `persona_${personaId}_cog`
      );
      const cogText = `[认知] 价值观排序：${bundle.cognition.values_ranking.join(' > ')}；风格：${bundle.cognition.decision_style}`;
      if (indexToRAG) {
        await indexToRAG(`cog_${personaId}`, cogText, { type: 'cognition', persona: personaId });
        stats.rag++;
      }
    }

    if (bundle.voice?.sample_transcripts) {
      for (const [i, st] of bundle.voice.sample_transcripts.entries()) {
        const t = `[音色·${st.context}] ${st.ja || st.ru || ''} ${st.ru_gloss ? '(' + st.ru_gloss + ')' : ''} 语气：${st.tone}`;
        if (indexToRAG) {
          await indexToRAG(`voice_${personaId}_${i}`, t, { type: 'voice', persona: personaId });
          stats.rag++;
        }
      }
    }

    personaProfile.setActiveBundle(bundle);

    const manifest = this._loadManifest();
    manifest.active = personaId;
    manifest.ingested[personaId] = {
      version: bundle.version,
      ingested_at: Date.now(),
      stats
    };
    this._saveManifest(manifest);
    this.copyForReview(personaId);

    return { bundle, stats };
  }

  getReviewData(personaId) {
    const reviewPath = path.join(this.reviewDir, `${personaId}.json`);
    const bundle = fs.existsSync(reviewPath)
      ? JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
      : this.loadBundle(personaId);
    const manifest = this._loadManifest();
    return {
      bundle,
      manifest: manifest.ingested[personaId] || null,
      review_file: reviewPath
    };
  }

  listPersonas() {
    const dir = path.join(this.repoRoot, 'config', 'personas');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''));
  }
}

module.exports = { PersonaBundleManager };
