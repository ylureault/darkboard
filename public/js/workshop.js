// Workshop features: Timer, Voting, Isolation, Follow Mode, Anchors

class Workshop {
  constructor(app) {
    this.app = app;
    this.isFacilitator = false;
    this.facilitatorId = null;

    // Timer state
    this.timer = null;
    this.timerInterval = null;

    // Voting state
    this.voting = null;
    this.myVotes = [];
    this.voteResults = {};

    // Isolation state
    this.isolation = null;

    // Follow mode
    this.followMode = false;
    this.followViewInterval = null;

    // Anchors
    this.anchors = new Map();
    this.anchorsVisible = false;
    this.anchorSearchOpen = false;

    this.initUI();
  }

  initUI() {
    // Facilitator panel buttons
    document.getElementById('btnTimer').addEventListener('click', () => this.showTimerModal());
    document.getElementById('btnVote').addEventListener('click', () => this.showVoteModal());
    document.getElementById('btnIsolation').addEventListener('click', () => this.toggleIsolation());
    document.getElementById('btnFollow').addEventListener('click', () => this.toggleFollowMode());

    // Timer modal
    document.getElementById('timerStart').addEventListener('click', () => this.startTimer());
    document.getElementById('timerCancel').addEventListener('click', () => this.hideTimerModal());
    document.getElementById('timerToggle').addEventListener('click', () => this.toggleTimer());
    document.getElementById('timerReset').addEventListener('click', () => this.resetTimer());
    document.getElementById('timerClear').addEventListener('click', () => this.clearTimer());

    // Vote modal
    document.getElementById('voteStart').addEventListener('click', () => this.startVote());
    document.getElementById('voteCancel').addEventListener('click', () => this.hideVoteModal());
    document.getElementById('voteReveal').addEventListener('click', () => this.revealVotes());
    document.getElementById('voteEnd').addEventListener('click', () => this.endVote());

    // Vote quota buttons
    document.querySelectorAll('.quota-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.quota-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Isolation buttons
    document.getElementById('isolationReveal').addEventListener('click', () => this.revealIsolation());
    document.getElementById('isolationCancel').addEventListener('click', () => this.cancelIsolation());

    // Follow mode
    document.getElementById('followStop').addEventListener('click', () => this.toggleFollowMode());

    // Anchors
    document.getElementById('anchorToggle').addEventListener('click', () => this.toggleAnchorsPanel());
    document.getElementById('anchorsClose').addEventListener('click', () => this.toggleAnchorsPanel());
    document.getElementById('anchorsAdd').addEventListener('click', () => this.addAnchorHere());
  }

  setFacilitator(isFacilitator, facilitatorId) {
    this.isFacilitator = isFacilitator;
    this.facilitatorId = facilitatorId;

    const panel = document.getElementById('facilitatorPanel');
    panel.style.display = isFacilitator ? '' : 'none';

    // Show/hide facilitator-only controls in timer
    document.getElementById('timerControls').style.display =
      isFacilitator && this.timer ? '' : 'none';

    // Vote controls
    document.getElementById('voteReveal').style.display =
      isFacilitator && this.voting ? '' : 'none';
    document.getElementById('voteEnd').style.display =
      isFacilitator && this.voting ? '' : 'none';

    // Isolation controls
    document.getElementById('isolationReveal').style.display =
      isFacilitator && this.isolation ? '' : 'none';
    document.getElementById('isolationCancel').style.display =
      isFacilitator && this.isolation ? '' : 'none';

    // Follow mode
    document.getElementById('followStop').style.display =
      isFacilitator && this.followMode ? '' : 'none';
  }

  // =====================
  // TIMER
  // =====================
  showTimerModal() {
    document.getElementById('timerModal').style.display = '';
  }

  hideTimerModal() {
    document.getElementById('timerModal').style.display = 'none';
  }

  startTimer() {
    const min = parseInt(document.getElementById('timerMinutes').value) || 0;
    const sec = parseInt(document.getElementById('timerSeconds').value) || 0;
    const duration = min * 60 + sec;
    if (duration <= 0) return;

    this.hideTimerModal();
    this.app.sync.send({
      type: 'timer-start',
      duration
    });
  }

  syncTimer(timer) {
    this.timer = timer;
    const display = document.getElementById('timerDisplay');
    const controls = document.getElementById('timerControls');

    if (!timer) {
      display.style.display = 'none';
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = null;
      if (this.isFacilitator) {
        document.getElementById('btnTimer').classList.remove('active');
      }
      return;
    }

    display.style.display = '';
    controls.style.display = this.isFacilitator ? '' : 'none';
    if (this.isFacilitator) {
      document.getElementById('btnTimer').classList.add('active');
      document.getElementById('timerToggle').textContent = timer.running ? 'Pause' : 'Reprendre';
    }

    // Start local countdown
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.updateTimerDisplay();
    this.timerInterval = setInterval(() => this.updateTimerDisplay(), 200);
  }

  updateTimerDisplay() {
    if (!this.timer) return;
    let remaining;
    if (this.timer.running) {
      const elapsed = (Date.now() - this.timer.startedAt) / 1000;
      remaining = Math.max(0, this.timer.duration - elapsed);
    } else {
      remaining = this.timer.remaining || 0;
    }

    const min = Math.floor(remaining / 60);
    const sec = Math.floor(remaining % 60);
    const timeEl = document.getElementById('timerTime');
    timeEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

    // Color coding
    timeEl.className = 'timer-time';
    if (remaining <= 0) {
      timeEl.classList.add('finished');
      // Play alert sound
      if (this.timer.running) {
        this.playTimerAlert();
        this.timer.running = false;
      }
    } else if (remaining <= 10) {
      timeEl.classList.add('danger');
    } else if (remaining <= 30) {
      timeEl.classList.add('warning');
    }
  }

  playTimerAlert() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(() => { osc.frequency.value = 1000; }, 200);
      setTimeout(() => { osc.frequency.value = 800; }, 400);
      setTimeout(() => { gain.gain.value = 0; osc.stop(); ctx.close(); }, 600);
    } catch (e) { /* audio not available */ }
  }

  toggleTimer() {
    if (!this.timer) return;
    if (this.timer.running) {
      this.app.sync.send({ type: 'timer-stop' });
    } else {
      this.app.sync.send({ type: 'timer-reset' });
    }
  }

  resetTimer() {
    this.app.sync.send({ type: 'timer-reset' });
  }

  clearTimer() {
    this.app.sync.send({ type: 'timer-clear' });
  }

  // =====================
  // VOTING
  // =====================
  showVoteModal() {
    if (this.voting) {
      // If vote active, ask to end it
      this.endVote();
      return;
    }
    document.getElementById('voteModal').style.display = '';
  }

  hideVoteModal() {
    document.getElementById('voteModal').style.display = 'none';
  }

  startVote() {
    const activeQuota = document.querySelector('.quota-btn.active');
    const quota = parseInt(activeQuota.dataset.quota);
    const hideResults = document.getElementById('voteHideResults').checked;

    this.hideVoteModal();
    this.app.sync.send({
      type: 'vote-start',
      quota,
      hideResults
    });
  }

  syncVoting(voting) {
    this.voting = voting;
    const bar = document.getElementById('voteBar');

    if (!voting || !voting.active) {
      bar.style.display = 'none';
      this.myVotes = [];
      this.voteResults = {};
      if (this.isFacilitator) {
        document.getElementById('btnVote').classList.remove('active');
      }
      this.app.renderer.markDirty();
      return;
    }

    bar.style.display = '';
    if (voting.myVotes) this.myVotes = voting.myVotes;
    if (voting.votes) this.voteResults = voting.votes;

    if (this.isFacilitator) {
      document.getElementById('btnVote').classList.add('active');
      document.getElementById('voteReveal').style.display = voting.hideResults ? '' : 'none';
      document.getElementById('voteEnd').style.display = '';
    }

    this.updateVoteBar();
    this.app.renderer.markDirty();
  }

  updateVoteBar() {
    if (!this.voting) return;
    const remaining = this.voting.quota > 0
      ? Math.max(0, this.voting.quota - this.myVotes.length)
      : -1;

    const text = remaining === -1
      ? 'Votes illimites'
      : `${remaining} vote${remaining !== 1 ? 's' : ''} restant${remaining !== 1 ? 's' : ''}`;

    document.getElementById('voteRemaining').textContent = text;
  }

  castVote(elementId) {
    if (!this.voting || !this.voting.active) return false;

    // Check if already voted on this
    const alreadyVoted = this.myVotes.includes(elementId);
    if (alreadyVoted) {
      // Unvote
      this.app.sync.send({ type: 'vote-uncast', elementId });
      const idx = this.myVotes.indexOf(elementId);
      if (idx !== -1) this.myVotes.splice(idx, 1);
      this.voteResults[elementId] = Math.max(0, (this.voteResults[elementId] || 0) - 1);
    } else {
      // Check quota
      if (this.voting.quota > 0 && this.myVotes.length >= this.voting.quota) {
        this.app.showToast('Plus de votes disponibles !');
        return false;
      }
      this.app.sync.send({ type: 'vote-cast', elementId });
      this.myVotes.push(elementId);
      this.voteResults[elementId] = (this.voteResults[elementId] || 0) + 1;
    }

    this.updateVoteBar();
    this.app.renderer.markDirty();
    return true;
  }

  handleVoteUpdate(msg) {
    if (msg.myVotes) this.myVotes = msg.myVotes;
    if (msg.elementId !== undefined && msg.count !== undefined) {
      this.voteResults[msg.elementId] = msg.count;
    }
    this.updateVoteBar();
    this.app.renderer.markDirty();
  }

  handleVoteReveal(msg) {
    if (msg.votes) this.voteResults = msg.votes;
    if (this.voting) this.voting.hideResults = false;
    document.getElementById('voteReveal').style.display = 'none';
    this.app.renderer.markDirty();
    this.app.showToast('Resultats du vote reveles !');
  }

  handleVoteEnd(msg) {
    if (msg.results) this.voteResults = msg.results;
    this.voting = null;
    document.getElementById('voteBar').style.display = 'none';
    if (this.isFacilitator) {
      document.getElementById('btnVote').classList.remove('active');
    }
    // Keep results visible briefly
    this.app.renderer.markDirty();
    this.app.showToast('Vote termine !');
    // Clear results after 10 seconds
    setTimeout(() => {
      this.voteResults = {};
      this.myVotes = [];
      this.app.renderer.markDirty();
    }, 10000);
  }

  revealVotes() {
    this.app.sync.send({ type: 'vote-reveal' });
  }

  endVote() {
    this.app.sync.send({ type: 'vote-end' });
  }

  getVoteCount(elementId) {
    return this.voteResults[elementId] || 0;
  }

  hasVoted(elementId) {
    return this.myVotes.includes(elementId);
  }

  isVotingActive() {
    return this.voting && this.voting.active;
  }

  // =====================
  // ISOLATION MODE
  // =====================
  toggleIsolation() {
    if (this.isolation && this.isolation.active) {
      // Show options
      return;
    }
    this.app.sync.send({ type: 'isolation-start' });
  }

  syncIsolation(isolation) {
    this.isolation = isolation;
    const banner = document.getElementById('isolationBanner');

    if (!isolation || !isolation.active) {
      banner.style.display = 'none';
      if (this.isFacilitator) {
        document.getElementById('btnIsolation').classList.remove('active');
      }
      return;
    }

    banner.style.display = '';
    if (this.isFacilitator) {
      document.getElementById('btnIsolation').classList.add('active');
      document.getElementById('isolationReveal').style.display = '';
      document.getElementById('isolationCancel').style.display = '';
    }
  }

  revealIsolation() {
    this.app.sync.send({ type: 'isolation-reveal' });
  }

  cancelIsolation() {
    this.app.sync.send({ type: 'isolation-cancel' });
  }

  handleIsolationReveal(msg) {
    // Replace all elements with revealed ones
    this.app.renderer.elements.clear();
    for (const el of msg.elements) {
      this.app.renderer.elements.set(el.id, el);
    }
    this.isolation = null;
    document.getElementById('isolationBanner').style.display = 'none';
    if (this.isFacilitator) {
      document.getElementById('btnIsolation').classList.remove('active');
    }
    this.app.renderer.markDirty();
    this.app.showToast('Toutes les contributions sont revelees !');
  }

  // =====================
  // FOLLOW MODE
  // =====================
  toggleFollowMode() {
    if (this.followMode) {
      this.app.sync.send({ type: 'follow-stop' });
    } else {
      this.app.sync.send({ type: 'follow-start' });
    }
  }

  syncFollowMode(active, facilitatorId) {
    this.followMode = active;
    const banner = document.getElementById('followBanner');

    if (active) {
      banner.style.display = '';
      if (this.isFacilitator) {
        document.getElementById('btnFollow').classList.add('active');
        document.getElementById('followStop').style.display = '';
        document.getElementById('followText').textContent = 'Les participants suivent votre vue';

        // Start broadcasting view position
        if (this.followViewInterval) clearInterval(this.followViewInterval);
        this.followViewInterval = setInterval(() => {
          this.app.sync.send({
            type: 'follow-view',
            x: this.app.renderer.camera.x,
            y: this.app.renderer.camera.y,
            zoom: this.app.renderer.camera.zoom
          });
        }, 100);
      } else {
        document.getElementById('followStop').style.display = 'none';
        document.getElementById('followText').textContent = 'Vue synchronisee avec l\'animateur';
      }
    } else {
      banner.style.display = 'none';
      if (this.isFacilitator) {
        document.getElementById('btnFollow').classList.remove('active');
      }
      if (this.followViewInterval) {
        clearInterval(this.followViewInterval);
        this.followViewInterval = null;
      }
    }
  }

  handleFollowView(msg) {
    if (this.isFacilitator) return; // Facilitator doesn't follow themselves
    // Smoothly animate to facilitator's view
    this.app.animateToView(msg.x, msg.y, msg.zoom);
  }

  // =====================
  // ANCHORS
  // =====================
  toggleAnchorsPanel() {
    this.anchorsVisible = !this.anchorsVisible;
    document.getElementById('anchorsPanel').style.display = this.anchorsVisible ? '' : 'none';
    if (this.anchorsVisible) {
      this.renderAnchorsList();
    }
  }

  loadAnchors(anchors) {
    this.anchors.clear();
    if (anchors) {
      for (const a of anchors) {
        this.anchors.set(a.id, a);
      }
    }
    if (this.anchorsVisible) this.renderAnchorsList();
  }

  addAnchorHere() {
    const anchor = {
      id: generateId(),
      name: 'Ancre ' + (this.anchors.size + 1),
      x: this.app.renderer.camera.x,
      y: this.app.renderer.camera.y,
      zoom: this.app.renderer.camera.zoom
    };
    this.app.sync.send({ type: 'anchor-add', anchor });
  }

  handleAnchorAdd(msg) {
    this.anchors.set(msg.anchor.id, msg.anchor);
    if (this.anchorsVisible) this.renderAnchorsList();
    this.app.renderer.markDirty();
  }

  handleAnchorUpdate(msg) {
    const anchor = this.anchors.get(msg.anchorId);
    if (anchor) Object.assign(anchor, msg.props);
    if (this.anchorsVisible) this.renderAnchorsList();
    this.app.renderer.markDirty();
  }

  handleAnchorDelete(msg) {
    this.anchors.delete(msg.anchorId);
    if (this.anchorsVisible) this.renderAnchorsList();
    this.app.renderer.markDirty();
  }

  renderAnchorsList() {
    const list = document.getElementById('anchorsList');
    if (this.anchors.size === 0) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Aucune ancre. Cliquez + pour en ajouter.</div>';
      return;
    }

    list.innerHTML = '';
    for (const [id, anchor] of this.anchors) {
      const item = document.createElement('div');
      item.className = 'anchor-item';
      item.innerHTML = `
        <span class="anchor-icon">&#9875;</span>
        <span class="anchor-name">${this.escapeHtml(anchor.name)}</span>
        <div class="anchor-actions">
          <button class="anchor-action-btn" data-action="rename" title="Renommer">&#9998;</button>
          <button class="anchor-action-btn" data-action="delete" title="Supprimer">&#10005;</button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.anchor-action-btn')) return;
        this.navigateToAnchor(anchor);
      });

      item.querySelector('[data-action="rename"]').addEventListener('click', () => {
        const newName = prompt('Nouveau nom :', anchor.name);
        if (newName && newName.trim()) {
          this.app.sync.send({
            type: 'anchor-update',
            anchorId: id,
            props: { name: newName.trim() }
          });
        }
      });

      item.querySelector('[data-action="delete"]').addEventListener('click', () => {
        this.app.sync.send({ type: 'anchor-delete', anchorId: id });
      });

      list.appendChild(item);
    }
  }

  navigateToAnchor(anchor) {
    this.app.animateToView(anchor.x, anchor.y, anchor.zoom || 1);
  }

  // Keyboard-triggered anchor search
  openAnchorSearch() {
    if (this.anchors.size === 0) {
      this.app.showToast('Aucune ancre definie');
      return;
    }

    this.anchorSearchOpen = true;
    const overlay = document.createElement('div');
    overlay.className = 'anchor-search-dropdown';
    overlay.id = 'anchorSearchDropdown';

    const input = document.createElement('input');
    input.className = 'anchor-search-input';
    input.placeholder = 'Rechercher une ancre...';
    overlay.appendChild(input);

    const results = document.createElement('div');
    results.className = 'anchor-search-results';
    overlay.appendChild(results);

    document.body.appendChild(overlay);

    let selectedIdx = 0;
    const anchorsArr = Array.from(this.anchors.values());

    const render = (filter) => {
      const filtered = filter
        ? anchorsArr.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()))
        : anchorsArr;
      results.innerHTML = '';
      filtered.forEach((a, i) => {
        const item = document.createElement('div');
        item.className = 'anchor-search-item' + (i === selectedIdx ? ' selected' : '');
        item.innerHTML = `<span class="anchor-icon">&#9875;</span> ${this.escapeHtml(a.name)}`;
        item.addEventListener('click', () => {
          this.navigateToAnchor(a);
          close();
        });
        results.appendChild(item);
      });
      return filtered;
    };

    let filtered = render('');
    input.focus();

    const close = () => {
      overlay.remove();
      this.anchorSearchOpen = false;
    };

    input.addEventListener('input', () => {
      selectedIdx = 0;
      filtered = render(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1);
        render(input.value);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        render(input.value);
      }
      if (e.key === 'Enter') {
        if (filtered[selectedIdx]) {
          this.navigateToAnchor(filtered[selectedIdx]);
          close();
        }
      }
      e.stopPropagation();
    });

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('pointerdown', function handler(e) {
        if (!overlay.contains(e.target)) {
          close();
          document.removeEventListener('pointerdown', handler);
        }
      });
    }, 0);
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
