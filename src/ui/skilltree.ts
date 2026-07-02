// Skill tree panel (K): three columns, six tiers, point-gated. Click to
// invest; right-column shows Grit Rank perks (account-wide meta).

import { PLAYER_CLASS, tierGate, type SkillDef } from '../data/classes';
import { state, GRIT_PERKS } from '../game/state';
import { audio } from '../audio/synth';

export class SkillTreePanel {
  render(root: HTMLElement, onChange: () => void): void {
    const cls = PLAYER_CLASS;
    const cols = cls.trees.map((tree) => {
      const invested = state.pointsInTree(tree.id);
      let html = `<div class="tree-col"><h2>${tree.name}</h2><div class="t-blurb">${tree.blurb}</div><div class="t-pts">${invested} points invested</div>`;
      let lastTier = 0;
      for (const s of tree.skills) {
        if (s.tier !== lastTier) {
          lastTier = s.tier;
          const gate = tierGate(s.tier);
          html += `<div class="tier-gate">TIER ${s.tier}${gate > 0 ? ` — requires ${gate} pts` : ''}</div>`;
        }
        const pts = state.skills.get(s.id) ?? 0;
        const locked = invested < tierGate(s.tier) && pts === 0;
        const maxed = pts >= s.maxPoints;
        const kindLabel = s.kind === 'killskill' ? 'KILL SKILL' : s.kind === 'augment' ? 'RIG AUGMENT' : 'PASSIVE';
        html += `
          <div class="skill-node ${locked ? 'locked' : ''} ${maxed ? 'maxed' : ''}" data-skill="${s.id}" data-tree="${tree.id}">
            <div class="sn-pts">${pts}/${s.maxPoints}</div>
            <div>
              <div class="sn-name">${s.name} <span class="sn-kind">${kindLabel}</span></div>
              <div class="sn-desc">${s.desc(Math.max(1, pts))}</div>
              ${s.flavor ? `<div class="sn-flavor">${s.flavor}</div>` : ''}
            </div>
          </div>`;
      }
      return html + '</div>';
    }).join('');

    const gritAvail = state.grit.tokens - Object.values(state.grit.spent).reduce((a, b) => a + b, 0);
    const gritHtml = `
      <div class="tree-col" style="flex:0.7">
        <h2>GRIT RANK</h2>
        <div class="t-blurb">Account-wide. Earned by doing violence thoroughly. Survives death, respec, and poor decisions.</div>
        <div class="t-pts">${gritAvail} token${gritAvail === 1 ? '' : 's'} available · ${state.grit.killCount} kills · ${state.grit.critCount} crits · ${state.grit.lootCount} loots</div>
        ${GRIT_PERKS.map((p) => `
          <div class="skill-node ${gritAvail <= 0 ? 'locked' : ''}" data-grit="${p.stat}">
            <div class="sn-pts">${state.grit.spent[p.stat] ?? 0}</div>
            <div>
              <div class="sn-name">${p.label}</div>
              <div class="sn-desc">+1% per rank, forever.</div>
            </div>
          </div>`).join('')}
      </div>`;

    root.innerHTML = `
      <h1>${cls.charName} — ${cls.name}</h1>
      <div class="p-sub">${cls.blurb} · Action Skill: <b style="color:#ffd23c">${cls.actionSkill.name}</b> — ${cls.actionSkill.desc}
        &nbsp;·&nbsp; <b style="color:#8fff3d">${state.skillPoints} unspent point${state.skillPoints === 1 ? '' : 's'}</b></div>
      <div class="p-body"><div class="tree-cols" style="flex:1">${cols}${gritHtml}</div></div>
      <div class="p-hint">CLICK a skill to invest · tiers unlock at 5/10/15/20/25 points in that tree · K / ESC to close</div>`;

    root.querySelectorAll<HTMLElement>('[data-skill]').forEach((node) => {
      node.addEventListener('click', () => {
        const id = node.dataset.skill!;
        const treeId = node.dataset.tree!;
        const tree = cls.trees.find((t) => t.id === treeId)!;
        const skill = tree.skills.find((s) => s.id === id)!;
        const pts = state.skills.get(id) ?? 0;
        const invested = state.pointsInTree(treeId);
        if (state.skillPoints <= 0 || pts >= skill.maxPoints || (invested < tierGate(skill.tier) && pts === 0)) {
          audio.uiError();
          return;
        }
        state.skills.set(id, pts + 1);
        state.skillPoints--;
        audio.uiBuy();
        onChange();
        this.render(root, onChange);
      });
    });

    root.querySelectorAll<HTMLElement>('[data-grit]').forEach((node) => {
      node.addEventListener('click', () => {
        const stat = node.dataset.grit!;
        const avail = state.grit.tokens - Object.values(state.grit.spent).reduce((a, b) => a + b, 0);
        if (avail <= 0) { audio.uiError(); return; }
        state.grit.spent[stat] = (state.grit.spent[stat] ?? 0) + 1;
        state.saveGrit();
        audio.uiBuy();
        onChange();
        this.render(root, onChange);
      });
    });
  }
}
