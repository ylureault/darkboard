// Workshop features: Timer, Voting, Isolation, Follow Mode, Anchors,
// Prioritization Matrix, Round Robin, Enhanced Voting, Silent Brainstorm, Auto Clusters, Check-in

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
    this.voterDetails = {}; // elementId -> [{name, color}]

    // Isolation state
    this.isolation = null;

    // Follow mode
    this.followMode = false;
    this.followViewInterval = null;

    // Anchors
    this.anchors = new Map();
    this.anchorsVisible = false;
    this.anchorSearchOpen = false;

    // Round Robin state
    this.roundRobin = null;

    // Silent Brainstorm state
    this.silentBrainstorm = false;
    this.brainstormTimerCallback = null;

    // Check-in state
    this.checkin = null;
    this.myCheckinVote = null;

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

    // New workshop features
    // Brainstorm
    document.getElementById('btnBrainstorm').addEventListener('click', () => this.showBrainstormModal());
    document.getElementById('brainstormStart').addEventListener('click', () => this.startSilentBrainstorm());
    document.getElementById('brainstormCancel').addEventListener('click', () => {
      document.getElementById('brainstormModal').style.display = 'none';
    });

    // Round Robin
    document.getElementById('btnRoundRobin').addEventListener('click', () => this.startRoundRobin());
    document.getElementById('roundRobinNext').addEventListener('click', () => this.nextRoundRobin());
    document.getElementById('roundRobinStop').addEventListener('click', () => this.stopRoundRobin());

    // Check-in
    document.getElementById('btnCheckin').addEventListener('click', () => this.startCheckin());
    document.querySelectorAll('.checkin-emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => this.castCheckinVote(btn.dataset.emoji));
    });
    document.getElementById('checkinClose').addEventListener('click', () => {
      document.getElementById('checkinModal').style.display = 'none';
    });
    document.getElementById('checkinResultsClose').addEventListener('click', () => {
      document.getElementById('checkinResults').style.display = 'none';
    });

    // Prioritization Matrix
    document.getElementById('btnMatrix').addEventListener('click', () => this.showPrioritizationMatrix());

    // Auto Clusters
    document.getElementById('btnAutoCluster').addEventListener('click', () => this.autoCluster());

    // #R2-111: ROTI Poll
    const btnROTI = document.getElementById('btnROTI');
    if (btnROTI) btnROTI.addEventListener('click', () => this.showROTIPoll());

    // #R2-112: Fishbowl mode
    const btnFishbowl = document.getElementById('btnFishbowl');
    if (btnFishbowl) btnFishbowl.addEventListener('click', () => this.toggleFishbowl());

    // #R2-113: Export vote CSV
    const btnVoteCSV = document.getElementById('btnVoteCSV');
    if (btnVoteCSV) btnVoteCSV.addEventListener('click', () => this.exportVoteResultsCSV());

    // #R2-114: Timer presets
    const btnTimerPresets = document.getElementById('btnTimerPresets');
    if (btnTimerPresets) btnTimerPresets.addEventListener('click', () => this.showTimerPresets());

    // #R2-115: Break timer
    const btnBreakTimer = document.getElementById('btnBreakTimer');
    if (btnBreakTimer) btnBreakTimer.addEventListener('click', () => this.startBreakTimer(5));

    // #R2-116: Parking lot
    const btnParkingLot = document.getElementById('btnParkingLot');
    if (btnParkingLot) btnParkingLot.addEventListener('click', () => this.createParkingLot());

    // #R2-117: Sentiment analysis
    const btnSentiment = document.getElementById('btnSentiment');
    if (btnSentiment) btnSentiment.addEventListener('click', () => this.analyzeSentiment());

    // #R2-118: Word cloud
    const btnWordCloud = document.getElementById('btnWordCloud');
    if (btnWordCloud) btnWordCloud.addEventListener('click', () => this.generateWordCloud());

    // #R2-119: Voting heatmap
    const btnHeatmap = document.getElementById('btnHeatmap');
    if (btnHeatmap) btnHeatmap.addEventListener('click', () => this.showVotingHeatmap());

    // #R2-120: Retro template
    const btnRetroTemplate = document.getElementById('btnRetroTemplate');
    if (btnRetroTemplate) btnRetroTemplate.addEventListener('click', () => this.generateRetroTemplate());
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
    // #R2-183: Track timer usage for getting started checklist
    localStorage.setItem('darkboard-timer-used', '1');
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
      this.app.sync.send({ type: 'timer-start', duration: this.timer.remaining || this.timer.duration });
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
    const quota = activeQuota ? parseInt(activeQuota.dataset.quota) : 3;
    const hideResults = document.getElementById('voteHideResults').checked;

    this.hideVoteModal();
    // #R2-183: Track vote usage for getting started checklist
    localStorage.setItem('darkboard-vote-used', '1');
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
    if (msg.voterDetails) this.voterDetails = msg.voterDetails;
    if (this.voting) this.voting.hideResults = false;
    document.getElementById('voteReveal').style.display = 'none';
    this.app.renderer.markDirty();
    this.app.showToast('Résultats du vote révélés !');
  }

  handleVoteEnd(msg) {
    if (msg.results) this.voteResults = msg.results;
    if (msg.voterDetails) this.voterDetails = msg.voterDetails;
    this.voting = null;
    document.getElementById('voteBar').style.display = 'none';
    if (this.isFacilitator) {
      document.getElementById('btnVote').classList.remove('active');
    }
    // Keep results visible briefly
    this.app.renderer.markDirty();
    this.app.showToast('Vote terminé !');
    // Store last vote results for matrix feature
    this._lastVoteResults = Object.assign({}, this.voteResults);
    this._lastVoterDetails = Object.assign({}, this.voterDetails);
    // Clear results after 30 seconds (longer to allow matrix usage)
    setTimeout(() => {
      this.voteResults = {};
      this.voterDetails = {};
      this.myVotes = [];
      this.app.renderer.markDirty();
    }, 30000);
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

  getVoterDetails(elementId) {
    return this.voterDetails[elementId] || [];
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
    if (!msg.elements) { this.app.renderer.markDirty(); return; }
    for (const el of msg.elements) {
      this.app.renderer.elements.set(el.id, el);
    }
    this.isolation = null;
    document.getElementById('isolationBanner').style.display = 'none';
    if (this.isFacilitator) {
      document.getElementById('btnIsolation').classList.remove('active');
    }
    this.app.renderer.markDirty();
    this.app.showToast('Toutes les contributions sont révélées !');
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
        document.getElementById('followText').textContent = 'Vue synchronisée avec l\'animateur';
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
    this.addAnchor('Ancre ' + (this.anchors.size + 1),
      this.app.renderer.camera.x,
      this.app.renderer.camera.y,
      this.app.renderer.camera.zoom);
  }

  // Create an anchor at an explicit view. Used by addAnchorHere and by the
  // DarkBoard JSON importer when restoring a board's anchors.
  addAnchor(name, x, y, zoom) {
    if (typeof name !== 'string' || !name.trim()) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const anchor = {
      id: generateId(),
      name: name.slice(0, 200),
      x, y,
      zoom: (Number.isFinite(zoom) && zoom > 0 && zoom <= 100) ? zoom : 1
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
      list.innerHTML = '<div class="panel-empty-state">' +
        '<div class="empty-state-icon">&#9875;</div>' +
        '<div class="empty-state-title">Aucune ancre</div>' +
        '<div class="empty-state-hint">Cliquez sur <kbd>+</kbd> pour mémoriser la vue actuelle</div>' +
        '</div>';
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
      this.app.showToast('Aucune ancre définie');
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

  // =====================
  // PRIORITIZATION MATRIX (#40)
  // =====================
  showPrioritizationMatrix() {
    if (!this.isFacilitator) return;

    // Use current vote results or last saved results
    const results = (Object.keys(this.voteResults).length > 0)
      ? this.voteResults
      : (this._lastVoteResults || {});

    // Get elements that received votes
    const votedElements = [];
    for (const [elementId, count] of Object.entries(results)) {
      if (count > 0) {
        const el = this.app.renderer.elements.get(elementId);
        if (el) votedElements.push({ id: elementId, count, element: el });
      }
    }

    if (votedElements.length === 0) {
      this.app.showToast('Aucun élément avec des votes. Lancez d\'abord un vote.');
      return;
    }

    // Sort by vote count descending
    votedElements.sort((a, b) => b.count - a.count);

    // Split into impact fort (top 50%) and impact faible (bottom 50%)
    const mid = Math.ceil(votedElements.length / 2);
    const impactFort = votedElements.slice(0, mid);
    const impactFaible = votedElements.slice(mid);

    // Matrix dimensions
    const matrixW = 1200;
    const matrixH = 800;
    const headerH = 40;
    const padding = 20;
    const quadW = (matrixW - padding * 3) / 2;
    const quadH = (matrixH - headerH - padding * 3) / 2;

    // Position matrix at center of current view
    const cam = this.app.renderer.camera;
    const matrixX = cam.x - matrixW / 2;
    const matrixY = cam.y - matrixH / 2;

    const ops = [];
    const inverseOps = [];
    const frameId = generateId();
    let zBase = Date.now();

    // applyOps keys elements off op.elementId, and elements are measured with
    // width/height/text — using element-only ops with w/h/label collapsed every
    // created element into a single `undefined` map slot.
    const addEl = (el) => {
      el.zIndex = zBase++;
      ops.push({ type: 'add', elementId: el.id, element: el });
      inverseOps.push({ type: 'delete', elementId: el.id });
    };

    // Create the frame
    addEl({
      id: frameId,
      type: 'frame',
      x: matrixX,
      y: matrixY,
      width: matrixW,
      height: matrixH,
      text: 'Matrice de priorisation',
      fill: 'rgba(30,30,30,0.5)',
      stroke: '#555',
      strokeWidth: 2
    });

    // Quadrant labels as text elements
    const quadrants = [
      { label: 'Impact fort / Effort faible', color: '#4ecdc4', x: matrixX + padding, y: matrixY + headerH + padding, items: [] },
      { label: 'Impact fort / Effort fort', color: '#ff9f43', x: matrixX + padding * 2 + quadW, y: matrixY + headerH + padding, items: [] },
      { label: 'Impact faible / Effort faible', color: '#4a9eff', x: matrixX + padding, y: matrixY + headerH + padding * 2 + quadH, items: [] },
      { label: 'Impact faible / Effort fort', color: '#e94560', x: matrixX + padding * 2 + quadW, y: matrixY + headerH + padding * 2 + quadH, items: [] }
    ];

    // Distribute: impact fort row
    const midFort = Math.ceil(impactFort.length / 2);
    quadrants[0].items = impactFort.slice(0, midFort); // effort faible
    quadrants[1].items = impactFort.slice(midFort);     // effort fort

    // Impact faible row
    const midFaible = Math.ceil(impactFaible.length / 2);
    quadrants[2].items = impactFaible.slice(0, midFaible); // effort faible
    quadrants[3].items = impactFaible.slice(midFaible);     // effort fort

    // Create quadrant labels and position elements
    for (const q of quadrants) {
      // Quadrant background first so the label sits on top of it
      addEl({
        id: generateId(),
        type: 'rect',
        x: q.x,
        y: q.y,
        width: quadW,
        height: quadH,
        fill: q.color + '10',
        stroke: q.color + '40',
        strokeWidth: 1
      });

      addEl({
        id: generateId(),
        type: 'text',
        x: q.x + 8,
        y: q.y + 4,
        width: quadW - 16,
        height: 24,
        text: q.label,
        fontSize: 13,
        fontWeight: 'bold',
        fill: q.color,
        stroke: 'none'
      });

      // Position items in grid within quadrant
      const itemPadding = 30;
      const cols = Math.max(1, Math.ceil(Math.sqrt(q.items.length)));
      const cellW = (quadW - itemPadding * 2) / cols;
      const cellH = (quadH - itemPadding * 2 - 24) / Math.max(1, Math.ceil(q.items.length / cols));

      q.items.forEach((item, i) => {
        const el = this.app.renderer.elements.get(item.id);
        if (!el) return;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const newX = q.x + itemPadding + col * cellW + cellW / 2 - (el.width || 140) / 2;
        const newY = q.y + itemPadding + 24 + row * cellH + cellH / 2 - (el.height || 140) / 2;
        ops.push({ type: 'update', elementId: item.id, props: { x: newX, y: newY } });
        inverseOps.push({ type: 'update', elementId: item.id, props: { x: el.x, y: el.y } });
      });
    }

    // Send all ops
    this.app.applyOps(ops);
    this.app.history.push(ops, inverseOps);
    this.app.sync.sendOps(ops);
    this.app.showToast('Matrice de priorisation créée !');
  }

  // =====================
  // ROUND ROBIN (#41)
  // =====================
  startRoundRobin() {
    if (!this.isFacilitator) return;
    if (this.roundRobin && this.roundRobin.active) {
      this.stopRoundRobin();
      return;
    }
    this.app.sync.send({ type: 'round-robin', action: 'start' });
  }

  nextRoundRobin() {
    if (!this.isFacilitator) return;
    this.app.sync.send({ type: 'round-robin', action: 'next' });
  }

  stopRoundRobin() {
    if (!this.isFacilitator) return;
    this.app.sync.send({ type: 'round-robin', action: 'stop' });
  }

  syncRoundRobin(msg) {
    this.roundRobin = msg;
    const banner = document.getElementById('roundRobinBanner');

    if (!msg || !msg.active) {
      banner.style.display = 'none';
      if (this.isFacilitator) {
        document.getElementById('btnRoundRobin').classList.remove('active');
      }
      if (msg && msg.index === -1) {
        this.app.showToast('Tour de table terminé !');
      }
      return;
    }

    banner.style.display = '';
    const progress = msg.order ? `(${msg.index + 1}/${msg.order.length})` : '';
    document.getElementById('roundRobinText').textContent =
      `Tour de table ${progress} — ${msg.currentName || '?'}`;

    if (this.isFacilitator) {
      document.getElementById('btnRoundRobin').classList.add('active');
      document.getElementById('roundRobinNext').style.display = '';
      document.getElementById('roundRobinStop').style.display = '';
    } else {
      document.getElementById('roundRobinNext').style.display = 'none';
      document.getElementById('roundRobinStop').style.display = 'none';
    }

    // Highlight if it's the current user's turn
    if (msg.currentUserId === this.app.myUserId) {
      banner.style.borderColor = 'var(--warning)';
      banner.style.color = 'var(--warning)';
    } else {
      banner.style.borderColor = 'var(--success)';
      banner.style.color = 'var(--success)';
    }
  }

  // =====================
  // SILENT BRAINSTORM (#44)
  // =====================
  showBrainstormModal() {
    if (!this.isFacilitator) return;
    document.getElementById('brainstormModal').style.display = '';
  }

  startSilentBrainstorm() {
    const minutes = parseInt(document.getElementById('brainstormMinutes').value) || 5;
    document.getElementById('brainstormModal').style.display = 'none';

    // Start isolation mode
    this.app.sync.send({ type: 'isolation-start' });

    // Start timer
    const duration = minutes * 60;
    this.app.sync.send({ type: 'timer-start', duration });

    this.silentBrainstorm = true;
    this.app.showToast('Brainstorm silencieux lancé pour ' + minutes + ' minutes');

    // Monitor timer to auto-reveal when done
    this._brainstormCheckInterval = setInterval(() => {
      if (!this.timer || !this.silentBrainstorm) {
        clearInterval(this._brainstormCheckInterval);
        return;
      }
      let remaining;
      if (this.timer.running) {
        const elapsed = (Date.now() - this.timer.startedAt) / 1000;
        remaining = Math.max(0, this.timer.duration - elapsed);
      } else {
        remaining = this.timer.remaining || 0;
      }

      if (remaining <= 0 && this.silentBrainstorm && this.isFacilitator) {
        this.silentBrainstorm = false;
        clearInterval(this._brainstormCheckInterval);
        // Auto-reveal isolation
        this.app.sync.send({ type: 'isolation-reveal' });
        this.app.sync.send({ type: 'timer-clear' });
        this.app.showToast('Brainstorm terminé ! Contributions révélées.');
      }
    }, 500);
  }

  // =====================
  // AUTO CLUSTERS (#45)
  // =====================
  autoCluster() {
    if (!this.isFacilitator) return;

    // Get all visible stickies
    const stickies = [];
    for (const [id, el] of this.app.renderer.elements) {
      if (el.type === 'sticky' || el.type === 'card') {
        stickies.push({ id, element: el });
      }
    }

    if (stickies.length === 0) {
      this.app.showToast('Aucun post-it à regrouper.');
      return;
    }

    // Group by tags first
    const tagGroups = {};
    const untagged = [];
    for (const s of stickies) {
      const tags = s.element.tags || [];
      if (tags.length > 0) {
        const tagKey = tags.sort().join('|');
        if (!tagGroups[tagKey]) tagGroups[tagKey] = [];
        tagGroups[tagKey].push(s);
      } else {
        untagged.push(s);
      }
    }

    // For untagged, do simple text similarity (Jaccard on words)
    const textClusters = [];
    const assigned = new Set();

    const getWords = (el) => {
      const text = (el.text || el.label || '').toLowerCase();
      return text.split(/\s+/).filter(w => w.length > 2);
    };

    const jaccard = (a, b) => {
      const setA = new Set(a);
      const setB = new Set(b);
      const intersection = new Set([...setA].filter(x => setB.has(x)));
      const union = new Set([...setA, ...setB]);
      return union.size === 0 ? 0 : intersection.size / union.size;
    };

    for (let i = 0; i < untagged.length; i++) {
      if (assigned.has(i)) continue;
      const cluster = [untagged[i]];
      assigned.add(i);
      const wordsI = getWords(untagged[i].element);
      for (let j = i + 1; j < untagged.length; j++) {
        if (assigned.has(j)) continue;
        const wordsJ = getWords(untagged[j].element);
        if (jaccard(wordsI, wordsJ) > 0.2) {
          cluster.push(untagged[j]);
          assigned.add(j);
        }
      }
      textClusters.push(cluster);
    }

    // Merge all clusters
    const allClusters = [
      ...Object.entries(tagGroups).map(([key, items]) => ({ label: key.replace(/\|/g, ', '), items })),
      ...textClusters.map((items, i) => ({ label: 'Groupe ' + (i + 1), items }))
    ];

    if (allClusters.length === 0) {
      this.app.showToast('Pas de groupes détectés.');
      return;
    }

    // Arrange clusters in a grid
    const cam = this.app.renderer.camera;
    const startX = cam.x - 600;
    const startY = cam.y - 400;
    const clusterW = 400;
    const clusterH = 400;
    const gap = 40;
    const cols = Math.max(1, Math.ceil(Math.sqrt(allClusters.length)));

    const ops = [];
    const inverseOps = [];

    allClusters.forEach((cluster, ci) => {
      const col = ci % cols;
      const row = Math.floor(ci / cols);
      const frameX = startX + col * (clusterW + gap);
      const frameY = startY + row * (clusterH + gap);

      // Create frame
      const frameId = generateId();
      const frameEl = {
        id: frameId,
        type: 'frame',
        x: frameX,
        y: frameY,
        width: clusterW,
        height: clusterH,
        text: cluster.label,
        fill: 'rgba(74,158,255,0.05)',
        stroke: 'rgba(74,158,255,0.3)',
        strokeWidth: 1,
        zIndex: Date.now() + ops.length
      };
      ops.push({ type: 'add', elementId: frameId, element: frameEl });
      inverseOps.push({ type: 'delete', elementId: frameId });

      // Position items within frame
      const itemCols = Math.max(1, Math.ceil(Math.sqrt(cluster.items.length)));
      const itemPad = 20;
      const cellW = (clusterW - itemPad * 2) / itemCols;
      const cellH = (clusterH - itemPad * 2 - 30) / Math.max(1, Math.ceil(cluster.items.length / itemCols));

      cluster.items.forEach((item, ii) => {
        const el = this.app.renderer.elements.get(item.id);
        if (!el) return;
        const c = ii % itemCols;
        const r = Math.floor(ii / itemCols);
        const elW = el.width || 140;
        const elH = el.height || 140;
        ops.push({
          type: 'update',
          elementId: item.id,
          props: {
            x: frameX + itemPad + c * cellW + cellW / 2 - elW / 2,
            y: frameY + itemPad + 30 + r * cellH + cellH / 2 - elH / 2
          }
        });
        inverseOps.push({ type: 'update', elementId: item.id, props: { x: el.x, y: el.y } });
      });
    });

    this.app.applyOps(ops);
    this.app.history.push(ops, inverseOps);
    this.app.sync.sendOps(ops);
    this.app.showToast(allClusters.length + ' clusters créés !');
  }

  // =====================
  // CHECK-IN / CHECK-OUT (#49)
  // =====================
  startCheckin() {
    if (!this.isFacilitator) return;
    this.app.sync.send({ type: 'checkin-start' });
  }

  castCheckinVote(emoji) {
    if (!this.checkin || !this.checkin.active) return;

    this.myCheckinVote = emoji;
    this.app.sync.send({ type: 'checkin-vote', emoji });

    // Highlight selected
    document.querySelectorAll('.checkin-emoji-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.emoji === emoji);
    });

    this.app.showToast('Vote enregistré !');
  }

  syncCheckin(msg) {
    this.checkin = msg;

    if (!msg || !msg.active) {
      document.getElementById('checkinModal').style.display = 'none';
      document.getElementById('checkinResults').style.display = 'none';
      if (this.isFacilitator) {
        document.getElementById('btnCheckin').classList.remove('active');
      }
      return;
    }

    if (this.isFacilitator) {
      document.getElementById('btnCheckin').classList.add('active');
    }

    // Show modal for participants who haven't voted
    const myResponse = msg.responses && msg.responses[this.app.myUserId];
    if (!myResponse) {
      document.getElementById('checkinModal').style.display = '';
      // Reset selection
      document.querySelectorAll('.checkin-emoji-btn').forEach(btn => {
        btn.classList.remove('selected');
      });
    } else {
      document.getElementById('checkinModal').style.display = 'none';
    }

    // Show results to facilitator (always) and to all after voting
    if (this.isFacilitator || myResponse) {
      this.renderCheckinResults(msg.responses || {});
    }
  }

  renderCheckinResults(responses) {
    const container = document.getElementById('checkinResults');
    const body = document.getElementById('checkinResultsBody');
    container.style.display = '';

    const emojis = ['😊', '😐', '😕', '😫', '🔥', '💪', '🤔', '😴'];
    const counts = {};
    const names = {};
    let total = 0;

    for (const [uid, resp] of Object.entries(responses)) {
      counts[resp.emoji] = (counts[resp.emoji] || 0) + 1;
      if (!names[resp.emoji]) names[resp.emoji] = [];
      names[resp.emoji].push(resp.name);
      total++;
    }

    body.innerHTML = '';
    const maxCount = Math.max(1, ...Object.values(counts));

    for (const emoji of emojis) {
      const count = counts[emoji] || 0;
      if (count === 0 && total > 0) continue; // Only show emojis with votes when there are votes

      const row = document.createElement('div');
      row.className = 'checkin-bar-row';

      const emojiEl = document.createElement('span');
      emojiEl.className = 'checkin-bar-emoji';
      emojiEl.textContent = emoji;

      const track = document.createElement('div');
      track.className = 'checkin-bar-track';
      const fill = document.createElement('div');
      fill.className = 'checkin-bar-fill';
      fill.style.width = (total > 0 ? (count / maxCount) * 100 : 0) + '%';
      track.appendChild(fill);

      const countEl = document.createElement('span');
      countEl.className = 'checkin-bar-count';
      countEl.textContent = count;

      row.appendChild(emojiEl);
      row.appendChild(track);
      row.appendChild(countEl);
      body.appendChild(row);

      if (names[emoji] && names[emoji].length > 0 && this.isFacilitator) {
        const namesEl = document.createElement('div');
        namesEl.className = 'checkin-bar-names';
        namesEl.textContent = names[emoji].join(', ');
        body.appendChild(namesEl);
      }
    }

    if (total === 0) {
      body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px;">En attente des réponses...</div>';
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // #R2-111: ROTI (Return on Time Invested) quick poll
  showROTIPoll() {
    if (!this.isFacilitator) return;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const dlg = document.createElement('div');
    dlg.className = 'confirm-dialog';
    dlg.style.maxWidth = '400px';
    dlg.innerHTML = `<h3 style="margin:0 0 12px">ROTI - Retour sur le temps investi</h3>
      <p style="color:var(--text-muted);margin-bottom:12px">Notez de 1 (perte de temps) à 5 (excellent)</p>
      <div class="roti-buttons" style="display:flex;gap:8px;justify-content:center;margin:16px 0">
        ${[1,2,3,4,5].map(n => `<button class="roti-btn" data-score="${n}" style="width:48px;height:48px;border-radius:50%;border:2px solid var(--accent);background:var(--btn);color:var(--text);font-size:18px;cursor:pointer;font-weight:bold">${n}</button>`).join('')}
      </div>
      <div id="rotiResult" style="text-align:center;margin:8px 0;color:var(--text-muted)"></div>
      <div class="confirm-actions"><button onclick="event.target.closest('.confirm-overlay').remove()">Fermer</button></div>`;
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);
    const resultEl = dlg.querySelector('#rotiResult');
    const scores = [];
    dlg.querySelectorAll('.roti-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        scores.push(parseInt(btn.dataset.score));
        const avg = (scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1);
        resultEl.textContent = `Moyenne: ${avg}/5 (${scores.length} votes)`;
        btn.style.background = 'var(--accent)';
        btn.style.color = 'white';
      });
    });
  }

  // #R2-112: Fishbowl mode - only one user edits at a time
  toggleFishbowl() {
    if (!this.isFacilitator) return;
    this._fishbowlActive = !this._fishbowlActive;
    if (this._fishbowlActive) {
      this._fishbowlQueue = [];
      this._fishbowlCurrent = this.app.myUserId;
      this.app.showToast('Mode Fishbowl activé - vous êtes le premier éditeur');
    } else {
      this.app.showToast('Mode Fishbowl désactivé');
    }
    this.app.renderer.markDirty();
  }

  fishbowlNext() {
    if (!this._fishbowlActive || !this.isFacilitator) return;
    if (this._fishbowlQueue.length > 0) {
      this._fishbowlCurrent = this._fishbowlQueue.shift();
      this.app.showToast('Prochain éditeur dans le fishbowl');
    } else {
      this.app.showToast('Personne dans la file d\'attente');
    }
  }

  // #R2-113: Dot voting results export as CSV
  exportVoteResultsCSV() {
    const results = this.voteResults || {};
    const voterDetails = this.voterDetails || {};
    if (Object.keys(results).length === 0) {
      this.app.showToast('Pas de résultats de vote à exporter');
      return;
    }
    const rows = ['id,text,votes,voters'];
    for (const [elementId, count] of Object.entries(results)) {
      if (count <= 0) continue;
      const el = this.app.renderer.elements.get(elementId);
      const text = el ? (el.text || '').replace(/"/g, '""') : '';
      const voters = (voterDetails[elementId] || []).map(v => v.name).join('; ');
      rows.push(`${elementId},"${text}",${count},"${voters}"`);
    }
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = `darkboard-votes-${getBoardId()}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    this.app.showToast('Résultats du vote exportés en CSV !');
  }

  // #R2-114: Timer presets
  showTimerPresets() {
    const presets = [
      { label: '1 min', duration: 60 },
      { label: '3 min', duration: 180 },
      { label: '5 min', duration: 300 },
      { label: '10 min', duration: 600 },
    ];
    const self = this;
    const buttons = presets.map(p => ({
      label: p.label,
      action: () => {
        self.app.sync.send({ type: 'timer-start', duration: p.duration });
        self.app.showToast('Timer lancé : ' + p.label);
      }
    }));
    buttons.push({ label: 'Personnalise', action: () => self.showTimerModal() });
    buttons.push({ label: 'Annuler', action: () => {} });
    this.app.showConfirmDialog('Timer rapide:', buttons);
  }

  // #R2-115: Break timer with stretch reminder
  startBreakTimer(minutes) {
    if (!this.isFacilitator) return;
    const duration = (minutes || 5) * 60;
    this.app.sync.send({ type: 'timer-start', duration: duration });
    this.app.showToast('Pause de ' + (minutes || 5) + ' min - Levez-vous et étirez-vous !');
  }

  // #R2-116: Parking lot - dedicated frame for parked ideas
  createParkingLot() {
    const cam = this.app.renderer.camera;
    const frame = createFrame(cam.x + 400, cam.y - 200, 500, 600, 'Parking Lot');
    frame.stroke = '#ffd966';
    frame.fill = 'rgba(255, 217, 102, 0.05)';
    this.app.addElement(frame);
    // Add instruction sticky
    const sticky = createSticky(cam.x + 420, cam.y - 160);
    sticky.text = 'Glissez ici les idées à traiter plus tard';
    sticky.fill = '#ffd966';
    sticky.width = 180;
    sticky.height = 100;
    sticky.fontSize = 12;
    this.app.addElement(sticky);
    this.app.showToast('Parking Lot créé !');
  }

  // #R2-117: Sentiment analysis summary
  analyzeSentiment() {
    const stickies = [];
    for (const [, el] of this.app.renderer.elements) {
      if (el.type === 'sticky' && el.text) stickies.push(el);
    }
    if (stickies.length === 0) { this.app.showToast('Aucun post-it avec du texte'); return; }
    const positiveWords = ['bien', 'super', 'excellent', 'bravo', 'genial', 'top', 'merci', 'great', 'good', 'love', 'perfect', 'amazing', 'yes', 'oui', 'agree', 'like', 'happy', 'positif', 'ameliore'];
    const negativeWords = ['mal', 'probleme', 'difficile', 'non', 'pas', 'manque', 'bad', 'issue', 'bug', 'error', 'slow', 'no', 'fail', 'wrong', 'frustrant', 'bloquant', 'negatif', 'pire'];
    let positive = 0, negative = 0, neutral = 0;
    for (const s of stickies) {
      const words = s.text.toLowerCase().split(/\s+/);
      const hasPos = words.some(w => positiveWords.includes(w));
      const hasNeg = words.some(w => negativeWords.includes(w));
      if (hasPos && !hasNeg) positive++;
      else if (hasNeg && !hasPos) negative++;
      else neutral++;
    }
    this.app.showConfirmDialog(
      `Analyse de sentiment (${stickies.length} post-its):\n\n` +
      `Positif: ${positive} | Neutre: ${neutral} | Negatif: ${negative}`,
      [{ label: 'OK', action: () => {} }]
    );
  }

  // #R2-118: Word cloud generation from sticky text
  generateWordCloud() {
    const words = {};
    const stopWords = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'a', 'au', 'aux', 'pour', 'par', 'sur', 'dans', 'avec', 'ce', 'que', 'qui', 'est', 'the', 'a', 'an', 'and', 'or', 'is', 'are', 'to', 'of', 'in', 'on', 'it', 'at', 'for']);
    for (const [, el] of this.app.renderer.elements) {
      if ((el.type === 'sticky' || el.type === 'text') && el.text) {
        const ws = el.text.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
        for (const w of ws) words[w] = (words[w] || 0) + 1;
      }
    }
    const sorted = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 30);
    if (sorted.length === 0) { this.app.showToast('Pas assez de texte pour un nuage de mots'); return; }
    // Create word cloud as text elements on canvas
    const cam = this.app.renderer.camera;
    const maxCount = sorted[0][1];
    let x = cam.x - 300, y = cam.y - 200;
    for (const [word, count] of sorted) {
      const fontSize = Math.max(14, Math.round((count / maxCount) * 48));
      const textEl = createTextElement(x, y);
      textEl.text = word;
      textEl.fontSize = fontSize;
      textEl.fill = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
      textEl.width = word.length * fontSize * 0.6 + 20;
      textEl.height = fontSize + 10;
      this.app.addElement(textEl);
      x += textEl.width + 10;
      if (x > cam.x + 300) { x = cam.x - 300; y += 60; }
    }
    this.app.showToast('Nuage de mots généré avec ' + sorted.length + ' mots');
  }

  // #R2-119: Voting heat map overlay
  showVotingHeatmap() {
    const results = Object.keys(this.voteResults).length > 0 ? this.voteResults : (this._lastVoteResults || {});
    if (Object.keys(results).length === 0) { this.app.showToast('Pas de résultats de vote'); return; }
    // Toggle heatmap overlay
    this._heatmapActive = !this._heatmapActive;
    if (this._heatmapActive) {
      const maxVotes = Math.max(1, ...Object.values(results));
      for (const [elementId, count] of Object.entries(results)) {
        const el = this.app.renderer.elements.get(elementId);
        if (!el) continue;
        const intensity = count / maxVotes;
        // Store original opacity and set heat-based opacity
        el._origOpacity = el.opacity;
        el.opacity = 0.3 + intensity * 0.7;
      }
      this.app.showToast('Heatmap de vote activée');
    } else {
      // Restore original opacities
      for (const [elementId] of Object.entries(results)) {
        const el = this.app.renderer.elements.get(elementId);
        if (el && el._origOpacity !== undefined) { el.opacity = el._origOpacity; delete el._origOpacity; }
      }
      this.app.showToast('Heatmap de vote désactivée');
    }
    this.app.renderer.markDirty();
  }

  // #R2-120: Retro template with columns
  generateRetroTemplate() {
    const cam = this.app.renderer.camera;
    const colW = 350, colH = 600, gap = 20;
    const startX = cam.x - (colW * 3 + gap * 2) / 2;
    const startY = cam.y - colH / 2;
    const columns = [
      { title: 'Ce qui va bien', color: '#4ecdc4' },
      { title: 'A ameliorer', color: '#ff6b6b' },
      { title: 'Actions', color: '#4a9eff' }
    ];
    // Collect first, then add in one batch — six addElement() calls meant six WS
    // ops and six undo entries, so undoing the template left half of it behind.
    const created = [];
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const x = startX + i * (colW + gap);
      const frame = createFrame(x, startY, colW, colH, col.title);
      frame.stroke = col.color;
      frame.fill = col.color + '08';
      created.push(frame);
      // Add a starter sticky
      const sticky = createSticky(x + 20, startY + 50);
      sticky.fill = col.color + '40';
      sticky.text = '';
      sticky.width = 150;
      sticky.height = 150;
      created.push(sticky);
    }
    this.app.addElementsBatch(created);
    this.app.showToast('Template rétrospective créé !');
  }
}
