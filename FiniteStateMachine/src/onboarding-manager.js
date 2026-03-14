import { ui } from './ui-controller.js';

export const onboardingKeys = {
  welcome: 'fsm_onboarding_welcome_v1',
  palette: 'fsm_onboarding_palette_v1',
  stateDefinition: 'fsm_onboarding_state_definition_v1',
  transitionTable: 'fsm_onboarding_transition_table_v1',
  kmapFirst: 'fsm_onboarding_kmap_first_v1',
};

export class OnboardingManager {
  constructor() {
    this.activeCoachmark = null;
    this.queue = [];
    this.isSequenceActive = false;
  }

  hasSeen(key) {
    return localStorage.getItem(key) === 'true';
  }

  setSeen(key) {
    localStorage.setItem(key, 'true');
  }

  showCoachmark(step, { key, onClose } = {}) {
    if (key && this.hasSeen(key)) return null;
    this.closeActive();

    const popup = this.buildElement(step);
    ui.elements.coachmarkLayer?.appendChild(popup);
    
    const close = (reason) => {
      popup.remove();
      if (key) this.setSeen(key);
      if (this.activeCoachmark?.popup === popup) this.activeCoachmark = null;
      if (onClose) onClose(reason);
    };

    popup.querySelector('.coachmark-action').addEventListener('click', () => close('action'));
    this.activeCoachmark = { popup, close };
    return close;
  }

  closeActive() {
    if (this.activeCoachmark) {
      this.activeCoachmark.close('replace');
    }
  }

  buildElement({ title, text, actionLabel = 'Got it' }) {
    const div = document.createElement('div');
    div.className = 'coachmark-popup';
    div.innerHTML = `
      <div class="coachmark-content">
        ${title ? `<h3>${title}</h3>` : ''}
        <p>${text}</p>
        <div class="coachmark-actions">
          <button class="coachmark-action primary">${actionLabel}</button>
        </div>
      </div>
      <button class="coachmark-close" aria-label="Close">✕</button>
    `;
    return div;
  }
}

export const onboarding = new OnboardingManager();
